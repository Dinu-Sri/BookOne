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
} from 'lucide-react';
import {
  commitStatementBatch,
  commitStatementImport,
  confirmStatementCreates,
  confirmStatementLinks,
  getStatementBatch,
  skipStatementLines,
  undoStatementCreates,
  voidStatementImport,
  type StatementBatchItem,
  type StatementImportView,
  type StatementLineView,
} from '@/app/actions/statement-import';
import type { LiquidAccount } from '@/app/actions/cashbook-banks';

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

  function uploadFiles(fileList: FileList | File[]) {
    setError(null);
    setInfo(null);
    if (!bankId) {
      setError(si ? 'පළමුව බැංකුව තෝරන්න.' : 'Select a bank account first.');
      return;
    }
    const files = Array.from(fileList).filter((f) => f.size > 0);
    if (files.length === 0) return;

    const fd = new FormData();
    fd.set('bankAccountId', bankId);
    fd.set('source', source);
    if (bookDomain) fd.set('bookDomain', bookDomain);

    startTransition(() => {
      if (files.length === 1) {
        fd.set('file', files[0]!);
        commitStatementImport(fd).then(async (res) => {
          if (!res.ok) {
            setError(res.error);
            return;
          }
          if (res.reused) {
            setInfo(
              si
                ? 'මෙම ගොනුව කලින් උඩුගත කර ඇත — එම සමාලෝචනය පෙන්වයි.'
                : 'This file was uploaded before — showing that review.',
            );
          }
          setBatchId(null);
          setBatchItems([]);
          await reloadFromServer(res.importId);
        });
        return;
      }

      for (const f of files) fd.append('files', f);
      commitStatementBatch(fd).then(async (res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setBatchId(res.batchId);
        setBatchItems(res.items);
        const okIds = res.items.filter((i) => i.importId).map((i) => i.importId);
        const views = await getStatementBatch(okIds);
        setBatchViews(views);
        const first = views[0] ?? null;
        setImportView(first);
        const failed = res.items.filter((i) => i.error).length;
        const reused = res.items.filter((i) => i.reused).length;
        setInfo(
          si
            ? `${okIds.length} ගොනු · ${failed ? `${failed} අසාර්ථක · ` : ''}${reused ? `${reused} කලින්` : ''}`
            : `Imported ${okIds.length} file(s)${failed ? ` · ${failed} failed` : ''}${
                reused ? ` · ${reused} already known` : ''
              }.`,
        );
      });
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
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
            : `Confirmed ${res.linked} match${res.linked === 1 ? '' : 'es'}. Layout remembered for next time.`,
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
          ? 'නව ඇතුළත් කිරීම් ඔබේ පොතට එකතු කරන්නද? පසුව අහෝසි කළ හැක.'
          : 'Add new entries to your books from the bank file? You can undo later.',
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
        const extra =
          res.errors.length > 0
            ? ` (${res.errors.length} issue${res.errors.length > 1 ? 's' : ''})`
            : '';
        setInfo(
          si
            ? `${res.created} නව ඇතුළත් කිරීම්${extra}`
            : `Added ${res.created} new entr${res.created === 1 ? 'y' : 'ies'}${extra}.`,
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
        const ids = batchViews.map((v) => v.id);
        const views = await getStatementBatch(ids);
        setBatchViews(views);
        onComplete?.();
      })();
    });
  }

  function skipReviews() {
    if (!importView || !groups?.review.length) return;
    setError(null);
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
    if (
      !window.confirm(
        si
          ? 'මෙම ආයාතයෙන් එකතු කළ ඇතුළත් කිරීම් අහෝසි කරන්නද?'
          : 'Undo all entries created from this import?',
      )
    ) {
      return;
    }
    setError(null);
    startTransition(() => {
      undoStatementCreates({ importId: importView.id }).then(async (res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo(
          si
            ? `${res.reversed} අහෝසි කළා`
            : `Reversed ${res.reversed} entr${res.reversed === 1 ? 'y' : 'ies'}.`,
        );
        if (res.errors[0]) setError(res.errors.slice(0, 2).join(' · '));
        await reloadFromServer(importView.id);
        onComplete?.();
      });
    });
  }

  function discardImport() {
    if (!importView) return;
    if (
      !window.confirm(si ? 'මෙම උඩුගත කිරීම ඉවත් කරන්නද?' : 'Discard this import review?')
    ) {
      return;
    }
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
    setError(null);
    setInfo(null);
  }

  const shellClass = variant === 'cashbook' ? 'stmt-wizard cashbook-stmt' : 'stmt-wizard erp-stmt';
  const hasBatch = batchViews.length > 1 || batchItems.length > 1;

  return (
    <div className={shellClass}>
      <section className="stmt-section">
        <h2 className="stmt-h2">
          <Landmark size={20} />
          {si ? '1. බැංකුව තෝරන්න' : '1. Choose bank'}
        </h2>
        <p className="stmt-hint">
          {si
            ? 'එක් වරකට එක් ගිණුමක්. මාසික Excel කිහිපයක් එකවර දැමිය හැක.'
            : 'One account per upload. You can drop several monthly Excel files at once.'}
        </p>
        <div className="stmt-bank-tiles">
          {bankOnly.length === 0 ? (
            <p className="form-error">
              {si
                ? 'බැංකු ගිණුම් නැත — සැකසුම් වෙත යන්න.'
                : 'No bank accounts yet — add one in Settings.'}
            </p>
          ) : (
            bankOnly.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`stmt-bank-tile ${bankId === b.id ? 'active' : ''}`}
                disabled={pending || Boolean(importView)}
                onClick={() => setBankId(b.id)}
              >
                <strong>{b.shortName}</strong>
                <small>{b.code}</small>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="stmt-section">
        <h2 className="stmt-h2">
          <Upload size={20} />
          {si ? '2. Excel / CSV උඩුගත කරන්න' : '2. Upload Excel / CSV'}
        </h2>
        {!importView ? (
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
                {si ? 'ගෙනැවිත් දමන්න — එකක් හෝ කිහිපයක්' : 'Drag & drop one or many files'}
              </strong>
              <small>
                {si
                  ? 'බැංකු .xlsx / .csv — මාසයකට එකක් හොඳයි (වාර්ෂිකත් හරි)'
                  : 'Bank .xlsx / .csv — monthly is easiest (yearly OK with review)'}
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
                if (e.target.files?.length) uploadFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        ) : (
          <div className="stmt-file-bar">
            <div>
              <strong>{importView.fileName}</strong>
              <p className="stmt-meta">
                {importView.bankAccountName ?? 'Bank'} · {importView.periodFrom ?? '—'} →{' '}
                {importView.periodTo ?? '—'} · {importView.rowCount} lines
                {importView.profileName ? (
                  <span className="stmt-flag info">
                    {' '}
                    · Layout: {importView.profileName}
                    {importView.profileLearned ? ' (saved)' : ''}
                  </span>
                ) : null}
                {importView.multiMonth ? (
                  <span className="stmt-flag warn">
                    {' '}
                    {si ? '· බහු මාස' : '· Multi-month file'}
                  </span>
                ) : null}
                {importView.counts.balanceBreaks > 0 ? (
                  <span className="stmt-flag warn">
                    {' '}
                    · {importView.counts.balanceBreaks} balance flag
                    {importView.counts.balanceBreaks > 1 ? 's' : ''}
                  </span>
                ) : null}
              </p>
            </div>
            <button type="button" className="stmt-btn secondary" disabled={pending} onClick={resetUpload}>
              {si ? 'නව උඩුගත' : 'Upload more'}
            </button>
          </div>
        )}

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
                  {v.counts.link + v.counts.create + v.counts.review > 0
                    ? `${v.counts.link}m · ${v.counts.create}n · ${v.counts.review}c`
                    : v.status}
                </small>
              </button>
            ))}
            {batchItems
              .filter((i) => i.error)
              .map((i) => (
                <div key={i.fileName} className="stmt-batch-tab error" title={i.error}>
                  <span className="stmt-batch-name">{i.fileName}</span>
                  <small>Failed</small>
                </div>
              ))}
          </div>
        ) : null}
        {batchId ? (
          <p className="stmt-meta">
            Batch {batchId.slice(0, 8)}… · {batchViews.length} file
            {batchViews.length === 1 ? '' : 's'}
          </p>
        ) : null}
      </section>

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
              ? 'කිසිවක් පොතට නොයයි තහවුරු කරන තුරු. සාර්ථක ආකෘතිය මතක තබයි.'
              : 'Nothing posts until you confirm. Successful layouts are remembered for this bank.'}
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
            <div className="stmt-sum grey">
              <strong>{groups.duplicate.length}</strong>
              <span>{si ? 'දෙවරක්' : 'Dup'}</span>
            </div>
            <div className="stmt-sum muted">
              <strong>{groups.done.length}</strong>
              <span>{si ? 'අවසන්' : 'Done'}</span>
            </div>
          </div>

          {importView.warnings.length > 0 ? (
            <ul className="stmt-warnings">
              {importView.warnings.map((w) => (
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
              <button
                type="button"
                className="stmt-btn primary"
                disabled={pending}
                onClick={confirmAllBatchLinks}
              >
                <Link2 size={16} />
                {si ? 'සියලු ගොනු ගැලපීම්' : 'Confirm matches (all files)'}
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
              <span className="stmt-month-label">{si ? 'මාස අනුව' : 'By month'}</span>
              {multiMonthGroups.map((g) => (
                <span key={g.month} className="stmt-month-chip">
                  {formatMonth(g.month)} · {g.lines.length}
                </span>
              ))}
            </div>
          ) : null}

          <LineGroup
            title={si ? 'නිල් — පොතේ නැත' : 'New — not in books yet'}
            tone="blue"
            lines={groups.pendingCreate}
            empty={si ? 'නව නැත' : 'No new lines'}
            showMonths={Boolean(multiMonthGroups && multiMonthGroups.length > 1)}
          />
          <LineGroup
            title={si ? 'කොළ — පොතේ තිබේ' : 'Matches — already in books'}
            tone="green"
            lines={groups.pendingLink}
            empty={si ? 'ගැලපීම් නැත' : 'No matches to confirm'}
            showMonths={Boolean(multiMonthGroups && multiMonthGroups.length > 1)}
          />
          <LineGroup
            title={si ? 'කහ — ඔබේ ඇස්' : 'Check — needs your eyes'}
            tone="amber"
            lines={groups.review}
            empty={si ? 'හොඳයි' : 'Nothing ambiguous'}
            showMonths={Boolean(multiMonthGroups && multiMonthGroups.length > 1)}
          />
          <LineGroup
            title={si ? 'දැනටමත් ආයාත' : 'Already imported before'}
            tone="grey"
            lines={groups.duplicate}
            empty=""
            showMonths={false}
          />
          <LineGroup
            title={si ? 'අවසන්' : 'Finished'}
            tone="muted"
            lines={groups.done}
            empty=""
            showMonths={false}
          />
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
            {chunk.month ? (
              <h4 className="stmt-month-heading">{formatMonth(chunk.month)}</h4>
            ) : null}
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
                    <tr key={l.id} className={l.flags.includes('BALANCE_BREAK') ? 'flag-break' : ''}>
                      <td>{l.date}</td>
                      <td className="desc" title={l.description}>
                        {l.description}
                        {l.flags.includes('BALANCE_BREAK') ? (
                          <span className="stmt-inline-flag" title="Running balance does not follow">
                            {' '}
                            ⚠ bal
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span className={`stmt-chip ${l.status}`}>{labelStatus(l)}</span>
                      </td>
                      <td className={`num ${l.amount < 0 ? 'neg' : 'pos'}`}>{formatRs(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {chunk.lines.length > 80 ? (
                <p className="stmt-empty">Showing first 80 of {chunk.lines.length}</p>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function labelStatus(l: StatementLineView): string {
  if (l.flags.includes('BALANCE_BREAK') && l.status === 'review') return 'Bal. check';
  if (l.status === 'reconciled') return 'Linked';
  if (l.status === 'created') return 'Added';
  if (l.status === 'skipped') return 'Skipped';
  if (l.status === 'duplicate' || l.proposedAction === 'duplicate') return 'Duplicate';
  if (l.proposedAction === 'link') return 'Match';
  if (l.proposedAction === 'create') return 'New';
  return 'Review';
}
