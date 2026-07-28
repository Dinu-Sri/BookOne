'use client';

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  FileSpreadsheet,
  Loader2,
  Upload,
  Landmark,
  Undo2,
  SkipForward,
  Link2,
  PlusCircle,
  Trash2,
  Columns3,
} from 'lucide-react';
import {
  commitStatementBatch,
  commitStatementImport,
  confirmStatementCreates,
  confirmStatementLinks,
  getStatementBatch,
  previewStatementMapping,
  skipStatementLines,
  undoStatementCreates,
  voidStatementImport,
  type StatementBatchItem,
  type StatementImportView,
  type StatementLineView,
} from '@/app/actions/statement-import';
import type { LiquidAccount } from '@/app/actions/cashbook-banks';
import type { ColumnMap, ParseProfile, SignConvention } from '@bookone/statement-import';

function formatRs(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(n).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function groupLines(lines: StatementLineView[]) {
  const pendingLink: StatementLineView[] = [];
  const pendingCreate: StatementLineView[] = [];
  const review: StatementLineView[] = [];
  const done: StatementLineView[] = [];
  const duplicate: StatementLineView[] = [];

  for (const l of lines) {
    if (l.status === 'reconciled' || l.status === 'matched' || l.status === 'created') {
      done.push(l);
    } else if (l.status === 'duplicate' || l.proposedAction === 'duplicate') {
      duplicate.push(l);
    } else if (l.status === 'skipped') {
      done.push(l);
    } else if (l.proposedAction === 'link' && l.matchedTransactionId) {
      pendingLink.push(l);
    } else if (l.proposedAction === 'create') {
      pendingCreate.push(l);
    } else {
      review.push(l);
    }
  }
  return { pendingLink, pendingCreate, review, done, duplicate };
}

function byMonth(lines: StatementLineView[]): { month: string; lines: StatementLineView[] }[] {
  const map = new Map<string, StatementLineView[]>();
  for (const l of lines) {
    const m = l.month || l.date.slice(0, 7);
    if (!map.has(m)) map.set(m, []);
    map.get(m)!.push(l);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, ls]) => ({ month, lines: ls }));
}

type PendingFile = { file: File; name: string };

type MapDraft = {
  files: PendingFile[];
  profile: ParseProfile;
  headerRow: number;
  sheetName: string;
  sheetNames: string[];
  rows: string[][];
  maxColumns: number;
  sampleLines: {
    date: string;
    description: string;
    amountSigned: number;
    direction: string;
  }[];
  lineCount: number;
  periodFrom: string | null;
  periodTo: string | null;
  warnings: string[];
};

const MAP_FIELDS: { key: keyof ColumnMap; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount' },
  { key: 'type', label: 'DR/CR type' },
  { key: 'debit', label: 'Debit (out)' },
  { key: 'credit', label: 'Credit (in)' },
  { key: 'balance', label: 'Balance' },
  { key: 'ref', label: 'Reference' },
];

export function StatementImportWizard({
  banks,
  source,
  bookDomain,
  si = false,
  initialImport = null,
  variant = 'cashbook',
  onComplete,
}: {
  banks: LiquidAccount[];
  source: 'cashbook' | 'erp_recon';
  bookDomain?: 'personal' | 'business' | null;
  si?: boolean;
  initialImport?: StatementImportView | null;
  variant?: 'cashbook' | 'erp';
  onComplete?: () => void;
}) {
  const bankOnly = useMemo(
    () => banks.filter((b) => b.kind === 'bank' || b.kind === 'card' || b.code === '1000'),
    [banks],
  );
  const defaultBank =
    bankOnly.find((b) => b.kind === 'bank')?.id ?? bankOnly[0]?.id ?? '';

  const [bankId, setBankId] = useState(initialImport?.bankAccountId ?? defaultBank);
  const [importView, setImportView] = useState<StatementImportView | null>(initialImport);
  const [batchItems, setBatchItems] = useState<StatementBatchItem[]>([]);
  const [batchId, setBatchId] = useState<string | null>(initialImport?.batchId ?? null);
  const [batchViews, setBatchViews] = useState<StatementImportView[]>(
    initialImport ? [initialImport] : [],
  );
  const [mapDraft, setMapDraft] = useState<MapDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(
    () => (importView ? groupLines(importView.lines) : null),
    [importView],
  );

  const multiMonthGroups = useMemo(() => {
    if (!importView || !importView.multiMonth) return null;
    return byMonth(importView.lines);
  }, [importView]);

  const reloadFromServer = useCallback(async (importId: string) => {
    const { getStatementImport } = await import('@/app/actions/statement-import');
    const view = await getStatementImport(importId);
    if (view) {
      setImportView(view);
      setBatchViews((prev) => {
        const next = prev.filter((v) => v.id !== view.id);
        next.push(view);
        return next.sort((a, b) => a.fileName.localeCompare(b.fileName));
      });
    }
  }, []);

  function beginMapping(files: File[]) {
    setError(null);
    setInfo(null);
    if (!bankId) {
      setError(si ? 'පළමුව බැංකුව තෝරන්න.' : 'Select a bank account first.');
      return;
    }
    const list = files.filter((f) => f.size > 0);
    if (list.length === 0) return;

    const fd = new FormData();
    fd.set('file', list[0]!);

    startTransition(() => {
      previewStatementMapping(fd).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const bankName = bankOnly.find((b) => b.id === bankId)?.shortName ?? 'Bank';
        const profile: ParseProfile = {
          ...res.preview.suggested,
          name: res.preview.suggested.name || `${bankName} layout`,
          bankHint: bankName,
          sheetName: res.preview.sheetName,
          skipRows: res.preview.headerRowIndex,
        };
        setMapDraft({
          files: list.map((f) => ({ file: f, name: f.name })),
          profile,
          headerRow: res.preview.headerRowIndex,
          sheetName: res.preview.sheetName,
          sheetNames: res.preview.sheetNames,
          rows: res.preview.rows,
          maxColumns: res.preview.maxColumns,
          sampleLines: res.sampleLines,
          lineCount: res.lineCount,
          periodFrom: res.periodFrom,
          periodTo: res.periodTo,
          warnings: res.warnings,
        });
        setInfo(
          si
            ? 'තීරු සිතියම තහවුරු කරන්න — නිවැරදි මුදල් පෙන්වන තෙක්.'
            : 'Confirm column mapping. Check sample amounts before import.',
        );
      });
    });
  }

  function refreshPreview(next: Partial<MapDraft> & { profile?: ParseProfile; headerRow?: number }) {
    if (!mapDraft) return;
    const profile = next.profile ?? mapDraft.profile;
    const headerRow = next.headerRow ?? mapDraft.headerRow;
    const sheetName = next.sheetName ?? mapDraft.sheetName;
    const merged: ParseProfile = {
      ...profile,
      skipRows: headerRow,
      sheetName,
    };
    const fd = new FormData();
    fd.set('file', mapDraft.files[0]!.file);
    fd.set('profileJson', JSON.stringify(merged));
    fd.set('headerRow', String(headerRow));
    if (sheetName) fd.set('sheetName', sheetName);

    startTransition(() => {
      previewStatementMapping(fd).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setMapDraft({
          ...mapDraft,
          ...next,
          profile: merged,
          headerRow,
          sheetName: res.preview.sheetName || sheetName,
          sheetNames: res.preview.sheetNames,
          rows: res.preview.rows,
          maxColumns: res.preview.maxColumns,
          sampleLines: res.sampleLines,
          lineCount: res.lineCount,
          periodFrom: res.periodFrom,
          periodTo: res.periodTo,
          warnings: res.warnings,
        });
      });
    });
  }

  function setMapField(key: keyof ColumnMap, col: number | '') {
    if (!mapDraft) return;
    const columnMap = { ...mapDraft.profile.columnMap };
    if (col === '') delete columnMap[key];
    else columnMap[key] = col;

    let signConvention = mapDraft.profile.signConvention;
    // Auto-pick convention from fields
    if (columnMap.type != null && columnMap.amount != null) {
      signConvention = 'amount_with_type';
    } else if (columnMap.debit != null || columnMap.credit != null) {
      signConvention = 'debit_credit';
    } else {
      signConvention = 'signed_amount';
    }

    refreshPreview({
      profile: {
        ...mapDraft.profile,
        columnMap,
        signConvention,
        name: mapDraft.profile.name || 'My bank layout',
      },
    });
  }

  function setConvention(signConvention: SignConvention) {
    if (!mapDraft) return;
    refreshPreview({
      profile: { ...mapDraft.profile, signConvention },
    });
  }

  function confirmMappingAndImport() {
    if (!mapDraft || !bankId) return;
    if (mapDraft.lineCount === 0) {
      setError(
        si
          ? 'මේ සිතියමෙන් පේළි නැත — තීරු නිවැරදි කරන්න.'
          : 'No lines with this mapping — fix columns and try again.',
      );
      return;
    }
    if (
      !window.confirm(
        si
          ? `${mapDraft.lineCount} පේළි · නියැදි මුදල් නිවැරදිද? ආයාත කරන්න.`
          : `Import ${mapDraft.lineCount} line(s)? Check sample amounts look correct first.`,
      )
    ) {
      return;
    }

    const profile: ParseProfile = {
      ...mapDraft.profile,
      skipRows: mapDraft.headerRow,
      sheetName: mapDraft.sheetName,
      name: mapDraft.profile.name || 'My bank layout',
    };

    setError(null);
    startTransition(() => {
      if (mapDraft.files.length === 1) {
        const fd = new FormData();
        fd.set('file', mapDraft.files[0]!.file);
        fd.set('bankAccountId', bankId);
        fd.set('source', source);
        if (bookDomain) fd.set('bookDomain', bookDomain);
        fd.set('profileJson', JSON.stringify(profile));
        fd.set('forceProfile', '1');
        commitStatementImport(fd).then(async (res) => {
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setMapDraft(null);
          setBatchId(null);
          setBatchItems([]);
          if (res.reused) {
            setInfo(
              si
                ? 'මෙම ගොනුව කලින් උඩුගත කර ඇත.'
                : 'This file was uploaded before — showing that review.',
            );
          } else {
            setInfo(si ? 'සිතියම සුරැකිණි. සමාලෝචනය කරන්න.' : 'Mapping saved. Review matches below.');
          }
          await reloadFromServer(res.importId);
        });
        return;
      }

      const fd = new FormData();
      fd.set('bankAccountId', bankId);
      fd.set('source', source);
      if (bookDomain) fd.set('bookDomain', bookDomain);
      fd.set('profileJson', JSON.stringify(profile));
      fd.set('forceProfile', '1');
      for (const f of mapDraft.files) fd.append('files', f.file);
      commitStatementBatch(fd).then(async (res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setMapDraft(null);
        setBatchId(res.batchId);
        setBatchItems(res.items);
        const okIds = res.items.filter((i) => i.importId).map((i) => i.importId);
        const views = await getStatementBatch(okIds);
        setBatchViews(views);
        setImportView(views[0] ?? null);
        setInfo(
          si
            ? `${okIds.length} ගොනු ආයාත · සිතියම සුරැකිණි`
            : `Imported ${okIds.length} file(s) with your mapping.`,
        );
      });
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) beginMapping(Array.from(e.dataTransfer.files));
  }

  function selectBatchFile(importId: string) {
    const view = batchViews.find((v) => v.id === importId);
    if (view) setImportView(view);
    else void reloadFromServer(importId);
  }

  function confirmLinks() {
    if (!importView) return;
    setError(null);
    startTransition(() => {
      confirmStatementLinks({ importId: importView.id }).then(async (res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo(
          si
            ? `${res.linked} ගැලපීම් තහවුරු කළා.`
            : `Confirmed ${res.linked} match${res.linked === 1 ? '' : 'es'}. Layout remembered.`,
        );
        await reloadFromServer(importView.id);
        onComplete?.();
      });
    });
  }

  function confirmCreates() {
    if (!importView) return;
    setError(null);
    if (
      !window.confirm(
        si
          ? 'නව ඇතුළත් කිරීම් ඔබේ පොතට එකතු කරන්නද?'
          : 'Add new entries to your books? You can undo later.',
      )
    ) {
      return;
    }
    startTransition(() => {
      confirmStatementCreates({ importId: importView.id }).then(async (res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo(
          si
            ? `${res.created} නව ඇතුළත් කිරීම්`
            : `Added ${res.created} new entr${res.created === 1 ? 'y' : 'ies'}.`,
        );
        if (res.errors[0]) setError(res.errors.slice(0, 3).join(' · '));
        await reloadFromServer(importView.id);
        onComplete?.();
      });
    });
  }

  function confirmAllBatchLinks() {
    if (batchViews.length === 0) return;
    setError(null);
    startTransition(() => {
      (async () => {
        let total = 0;
        for (const v of batchViews) {
          const res = await confirmStatementLinks({ importId: v.id });
          if (res.ok) total += res.linked;
          else {
            setError(`${v.fileName}: ${res.error}`);
            break;
          }
        }
        setInfo(
          si
            ? `සියලු ගොනු · ${total} ගැලපීම්`
            : `Confirmed ${total} matches across ${batchViews.length} file(s).`,
        );
        if (importView) await reloadFromServer(importView.id);
        const views = await getStatementBatch(batchViews.map((v) => v.id));
        setBatchViews(views);
        onComplete?.();
      })();
    });
  }

  function skipReviews() {
    if (!importView || !groups?.review.length) return;
    startTransition(() => {
      skipStatementLines({
        importId: importView.id,
        lineIds: groups.review.map((l) => l.id),
      }).then(async (res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo(si ? `${res.skipped} මඟ හැරියා` : `Skipped ${res.skipped} line(s).`);
        await reloadFromServer(importView.id);
      });
    });
  }

  function undoCreates() {
    if (!importView) return;
    if (!window.confirm(si ? 'නව ඇතුළත් කිරීම් අහෝසි කරන්නද?' : 'Undo entries created from this import?')) {
      return;
    }
    startTransition(() => {
      undoStatementCreates({ importId: importView.id }).then(async (res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo(si ? `${res.reversed} අහෝසි` : `Reversed ${res.reversed}.`);
        await reloadFromServer(importView.id);
        onComplete?.();
      });
    });
  }

  function discardImport() {
    if (!importView) return;
    if (!window.confirm(si ? 'ඉවත් කරන්නද?' : 'Discard this import review?')) return;
    startTransition(() => {
      voidStatementImport(importView.id).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setBatchViews((prev) => prev.filter((v) => v.id !== importView.id));
        setImportView(null);
        setInfo(si ? 'ඉවත් කළා' : 'Import discarded.');
      });
    });
  }

  function resetUpload() {
    setImportView(null);
    setBatchItems([]);
    setBatchViews([]);
    setBatchId(null);
    setMapDraft(null);
    setError(null);
    setInfo(null);
  }

  const shellClass = variant === 'cashbook' ? 'stmt-wizard cashbook-stmt' : 'stmt-wizard erp-stmt';
  const hasBatch = batchViews.length > 1 || batchItems.length > 1;
  const colLabels = useMemo(() => {
    if (!mapDraft) return [] as string[];
    const header = mapDraft.rows[mapDraft.headerRow] ?? [];
    return Array.from({ length: mapDraft.maxColumns }, (_, i) => {
      const h = header[i]?.trim();
      return h ? `Col ${i + 1}: ${h}` : `Column ${i + 1}`;
    });
  }, [mapDraft]);

  return (
    <div className={shellClass}>
      <section className="stmt-section">
        <h2 className="stmt-h2">
          <Landmark size={20} />
          {si ? '1. බැංකුව තෝරන්න' : '1. Choose bank'}
        </h2>
        <p className="stmt-hint">
          {si
            ? 'එක් ගිණුමක්. බැංකු Excel වෙනස් විය හැක — සිතියම තහවුරු කරන්න.'
            : 'One account. Banks use different Excel layouts — you will confirm columns before import.'}
        </p>
        <div className="stmt-bank-tiles">
          {bankOnly.length === 0 ? (
            <p className="form-error">
              {si ? 'බැංකු නැත — සැකසුම්.' : 'No bank accounts — add one in Settings.'}
            </p>
          ) : (
            bankOnly.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`stmt-bank-tile ${bankId === b.id ? 'active' : ''}`}
                disabled={pending || Boolean(importView) || Boolean(mapDraft)}
                onClick={() => setBankId(b.id)}
              >
                <strong>{b.shortName}</strong>
                <small>{b.code}</small>
              </button>
            ))
          )}
        </div>
      </section>

      {/* Mapping step */}
      {mapDraft && !importView ? (
        <section className="stmt-section stmt-map-section">
          <h2 className="stmt-h2">
            <Columns3 size={20} />
            {si ? '2. තීරු සිතියම තහවුරු කරන්න' : '2. Confirm column mapping'}
          </h2>
          <p className="stmt-hint">
            {mapDraft.files.length > 1
              ? si
                ? `${mapDraft.files.length} ගොනු — එකම සිතියම භාවිතා වේ.`
                : `${mapDraft.files.length} files — same mapping applied to all.`
              : mapDraft.files[0]?.name}
          </p>

          <div className="stmt-map-grid">
            <label className="stmt-map-field">
              <span>{si ? 'ශීර්ෂ පේළිය' : 'Header row #'}</span>
              <select
                value={mapDraft.headerRow}
                disabled={pending}
                onChange={(e) => refreshPreview({ headerRow: Number(e.target.value) })}
              >
                {mapDraft.rows.map((_, i) => (
                  <option key={i} value={i}>
                    Row {i + 1}
                    {mapDraft.rows[i]?.filter(Boolean).slice(0, 3).join(' · ')
                      ? ` — ${mapDraft.rows[i]!.filter(Boolean).slice(0, 3).join(' · ').slice(0, 40)}`
                      : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="stmt-map-field">
              <span>{si ? 'මුදල් ආකාරය' : 'How amounts work'}</span>
              <select
                value={mapDraft.profile.signConvention}
                disabled={pending}
                onChange={(e) => setConvention(e.target.value as SignConvention)}
              >
                <option value="debit_credit">Debit + Credit columns (HNB-style)</option>
                <option value="amount_with_type">Amount + DR/CR type (Sampath-style)</option>
                <option value="signed_amount">Single amount (signed +/−)</option>
                <option value="credit_debit">Credit/Debit swapped (rare)</option>
              </select>
            </label>

            {MAP_FIELDS.map((f) => {
              const show =
                f.key === 'date' ||
                f.key === 'description' ||
                f.key === 'balance' ||
                f.key === 'ref' ||
                (f.key === 'amount' &&
                  (mapDraft.profile.signConvention === 'signed_amount' ||
                    mapDraft.profile.signConvention === 'amount_with_type')) ||
                (f.key === 'type' && mapDraft.profile.signConvention === 'amount_with_type') ||
                ((f.key === 'debit' || f.key === 'credit') &&
                  (mapDraft.profile.signConvention === 'debit_credit' ||
                    mapDraft.profile.signConvention === 'credit_debit'));
              if (!show) return null;
              const val = mapDraft.profile.columnMap[f.key];
              const num = typeof val === 'number' ? val : '';
              return (
                <label key={f.key} className="stmt-map-field">
                  <span>{f.label}</span>
                  <select
                    value={num === '' ? '' : String(num)}
                    disabled={pending}
                    onChange={(e) =>
                      setMapField(f.key, e.target.value === '' ? '' : Number(e.target.value))
                    }
                  >
                    <option value="">— not used —</option>
                    {colLabels.map((lab, i) => (
                      <option key={i} value={i}>
                        {lab}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>

          <div className="stmt-preview-block">
            <h3>
              {si ? 'නියැදි (පොතට යන ආකාරය)' : 'Sample as it will enter the books'}{' '}
              <span className="stmt-count">{mapDraft.lineCount}</span>
            </h3>
            {mapDraft.periodFrom ? (
              <p className="stmt-meta">
                {mapDraft.periodFrom} → {mapDraft.periodTo} · {mapDraft.lineCount} lines
              </p>
            ) : null}
            {mapDraft.sampleLines.length === 0 ? (
              <p className="form-error">
                {si
                  ? 'පේළි නැත — තීරු වෙනස් කරන්න.'
                  : 'No lines parsed. Adjust header row and columns.'}
              </p>
            ) : (
              <div className="stmt-table-wrap">
                <table className="stmt-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Dir</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapDraft.sampleLines.map((l, i) => (
                      <tr key={i}>
                        <td>{l.date}</td>
                        <td className="desc">{l.description}</td>
                        <td>{l.direction === 'in' ? 'In' : l.direction === 'out' ? 'Out' : '?'}</td>
                        <td className={`num ${l.amountSigned < 0 ? 'neg' : 'pos'}`}>
                          {formatRs(l.amountSigned)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {mapDraft.warnings.length > 0 ? (
            <ul className="stmt-warnings">
              {mapDraft.warnings.slice(0, 6).map((w) => (
                <li key={w}>
                  <CircleAlert size={14} /> {w}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="stmt-actions">
            <button
              type="button"
              className="stmt-btn accent"
              disabled={pending || mapDraft.lineCount === 0}
              onClick={confirmMappingAndImport}
            >
              {pending ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
              {si
                ? `සිතියම සුරකින්න හා ආයාත (${mapDraft.lineCount})`
                : `Save mapping & import (${mapDraft.lineCount})`}
            </button>
            <button type="button" className="stmt-btn secondary" disabled={pending} onClick={resetUpload}>
              {si ? 'අවලංගු' : 'Cancel'}
            </button>
          </div>

          <details className="stmt-raw-details">
            <summary>{si ? 'අමු Excel පේළි' : 'Raw Excel rows (first lines)'}</summary>
            <div className="stmt-table-wrap">
              <table className="stmt-table stmt-raw-table">
                <tbody>
                  {mapDraft.rows.slice(0, 15).map((row, ri) => (
                    <tr key={ri} className={ri === mapDraft.headerRow ? 'header-row' : ''}>
                      <td className="num">{ri + 1}</td>
                      {Array.from({ length: Math.min(mapDraft.maxColumns, 8) }, (_, ci) => (
                        <td key={ci}>{row[ci] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      ) : null}

      {/* Upload */}
      {!mapDraft && !importView ? (
        <section className="stmt-section">
          <h2 className="stmt-h2">
            <Upload size={20} />
            {si ? '2. Excel උඩුගත කරන්න' : '2. Upload Excel / CSV'}
          </h2>
          <div
            className={`stmt-drop ${dragOver ? 'over' : ''} ${pending ? 'busy' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !pending && fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
            }}
          >
            {pending ? <Loader2 className="spin" size={28} /> : <FileSpreadsheet size={28} />}
            <div>
              <strong>
                {si ? 'ගෙනැවිත් දමන්න — එකක් හෝ කිහිපයක්' : 'Drag & drop one or many bank files'}
              </strong>
              <small>
                {si
                  ? 'ඊළඟට තීරු සිතියම තහවුරු කරන්න (එක් වරක් සුරකියි)'
                  : 'Next: confirm columns once — saved for this bank next time'}
              </small>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              hidden
              multiple
              disabled={pending}
              onChange={(e) => {
                if (e.target.files?.length) beginMapping(Array.from(e.target.files));
                e.target.value = '';
              }}
            />
          </div>
        </section>
      ) : null}

      {importView ? (
        <section className="stmt-section">
          <div className="stmt-file-bar">
            <div>
              <strong>{importView.fileName}</strong>
              <p className="stmt-meta">
                {importView.bankAccountName ?? 'Bank'} · {importView.periodFrom ?? '—'} →{' '}
                {importView.periodTo ?? '—'} · {importView.rowCount} lines
                {importView.profileName ? (
                  <span className="stmt-flag info"> · {importView.profileName}</span>
                ) : null}
              </p>
            </div>
            <button type="button" className="stmt-btn secondary" disabled={pending} onClick={resetUpload}>
              {si ? 'නව උඩුගත' : 'Upload more'}
            </button>
          </div>
          {hasBatch ? (
            <div className="stmt-batch-tabs" role="tablist">
              {batchViews.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  className={`stmt-batch-tab ${importView?.id === v.id ? 'active' : ''}`}
                  onClick={() => selectBatchFile(v.id)}
                >
                  <span className="stmt-batch-name">{v.fileName}</span>
                  <small>
                    {v.counts.link}m · {v.counts.create}n · {v.counts.review}c
                  </small>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? <p className="form-error stmt-msg">{error}</p> : null}
      {info ? <p className="stmt-info stmt-msg">{info}</p> : null}

      {importView && groups ? (
        <section className="stmt-section">
          <h2 className="stmt-h2">
            <CheckCircle2 size={20} />
            {si ? '3. පරීක්ෂා කර තහවුරු කරන්න' : '3. Review & confirm'}
          </h2>
          <p className="stmt-hint">
            {si
              ? 'කිසිවක් පොතට නොයයි තහවුරු කරන තුරු.'
              : 'Nothing posts until you confirm. Successful mapping is remembered for this bank.'}
          </p>

          <div className="stmt-summary">
            <div className="stmt-sum green">
              <strong>{groups.pendingLink.length}</strong>
              <span>{si ? 'ගැලපේ' : 'Match'}</span>
            </div>
            <div className="stmt-sum blue">
              <strong>{groups.pendingCreate.length}</strong>
              <span>{si ? 'නව' : 'New'}</span>
            </div>
            <div className="stmt-sum amber">
              <strong>{groups.review.length}</strong>
              <span>{si ? 'පරීක්ෂා' : 'Check'}</span>
            </div>
            <div className="stmt-sum muted">
              <strong>{groups.done.length}</strong>
              <span>{si ? 'අවසන්' : 'Done'}</span>
            </div>
          </div>

          {importView.warnings.length > 0 ? (
            <ul className="stmt-warnings">
              {importView.warnings.slice(0, 8).map((w) => (
                <li key={w}>
                  <CircleAlert size={14} /> {w}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="stmt-actions">
            <button
              type="button"
              className="stmt-btn primary"
              disabled={pending || groups.pendingLink.length === 0}
              onClick={confirmLinks}
            >
              {pending ? <Loader2 size={16} className="spin" /> : <Link2 size={16} />}
              {si
                ? `ගැලපීම් (${groups.pendingLink.length})`
                : `Confirm matches (${groups.pendingLink.length})`}
            </button>
            {hasBatch ? (
              <button type="button" className="stmt-btn primary" disabled={pending} onClick={confirmAllBatchLinks}>
                <Link2 size={16} />
                {si ? 'සියලු ගොනු' : 'Confirm all files'}
              </button>
            ) : null}
            <button
              type="button"
              className="stmt-btn accent"
              disabled={pending || groups.pendingCreate.length === 0}
              onClick={confirmCreates}
            >
              {pending ? <Loader2 size={16} className="spin" /> : <PlusCircle size={16} />}
              {si
                ? `නව එකතු (${groups.pendingCreate.length})`
                : `Add new (${groups.pendingCreate.length})`}
            </button>
            <button
              type="button"
              className="stmt-btn secondary"
              disabled={pending || groups.review.length === 0}
              onClick={skipReviews}
            >
              <SkipForward size={16} />
              {si ? 'මඟ හරින්න' : 'Skip checks'}
            </button>
            <button
              type="button"
              className="stmt-btn secondary"
              disabled={pending || !importView.lines.some((l) => l.status === 'created')}
              onClick={undoCreates}
            >
              <Undo2 size={16} />
              {si ? 'නව අහෝසි' : 'Undo creates'}
            </button>
            <button type="button" className="stmt-btn danger" disabled={pending} onClick={discardImport}>
              <Trash2 size={16} />
              {si ? 'ඉවත්' : 'Discard'}
            </button>
          </div>

          {multiMonthGroups && multiMonthGroups.length > 1 ? (
            <div className="stmt-month-nav">
              <span className="stmt-month-label">{si ? 'මාස' : 'By month'}</span>
              {multiMonthGroups.map((g) => (
                <span key={g.month} className="stmt-month-chip">
                  {formatMonth(g.month)} · {g.lines.length}
                </span>
              ))}
            </div>
          ) : null}

          <LineGroup
            title={si ? 'නව' : 'New — not in books'}
            tone="blue"
            lines={groups.pendingCreate}
            empty={si ? 'නව නැත' : 'No new lines'}
            showMonths={Boolean(multiMonthGroups && multiMonthGroups.length > 1)}
          />
          <LineGroup
            title={si ? 'ගැලපේ' : 'Matches'}
            tone="green"
            lines={groups.pendingLink}
            empty={si ? 'නැත' : 'No matches'}
            showMonths={Boolean(multiMonthGroups && multiMonthGroups.length > 1)}
          />
          <LineGroup
            title={si ? 'පරීක්ෂා' : 'Check'}
            tone="amber"
            lines={groups.review}
            empty={si ? 'හොඳයි' : 'Nothing ambiguous'}
            showMonths={Boolean(multiMonthGroups && multiMonthGroups.length > 1)}
          />
          <LineGroup title={si ? 'අවසන්' : 'Finished'} tone="muted" lines={groups.done} empty="" showMonths={false} />
        </section>
      ) : null}
    </div>
  );
}

function LineGroup({
  title,
  tone,
  lines,
  empty,
  showMonths,
}: {
  title: string;
  tone: string;
  lines: StatementLineView[];
  empty: string;
  showMonths: boolean;
}) {
  if (lines.length === 0 && !empty) return null;
  const chunks = showMonths ? byMonth(lines) : [{ month: '', lines }];

  return (
    <div className={`stmt-group tone-${tone}`}>
      <h3>
        {title} <span className="stmt-count">{lines.length}</span>
      </h3>
      {lines.length === 0 ? (
        empty ? <p className="stmt-empty">{empty}</p> : null
      ) : (
        chunks.map((chunk) => (
          <div key={chunk.month || 'all'} className="stmt-month-block">
            {chunk.month ? <h4 className="stmt-month-heading">{formatMonth(chunk.month)}</h4> : null}
            <div className="stmt-table-wrap">
              <table className="stmt-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {chunk.lines.slice(0, 80).map((l) => (
                    <tr key={l.id} className={l.flags?.includes('BALANCE_BREAK') ? 'flag-break' : ''}>
                      <td>{l.date}</td>
                      <td className="desc" title={l.description}>
                        {l.description}
                      </td>
                      <td>
                        <span className={`stmt-chip ${l.status}`}>{labelStatus(l)}</span>
                      </td>
                      <td className={`num ${l.amount < 0 ? 'neg' : 'pos'}`}>{formatRs(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function labelStatus(l: StatementLineView): string {
  if (l.status === 'reconciled') return 'Linked';
  if (l.status === 'created') return 'Added';
  if (l.status === 'skipped') return 'Skipped';
  if (l.status === 'duplicate' || l.proposedAction === 'duplicate') return 'Duplicate';
  if (l.proposedAction === 'link') return 'Match';
  if (l.proposedAction === 'create') return 'New';
  return 'Review';
}
