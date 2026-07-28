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
  commitStatementImport,
  confirmStatementCreates,
  confirmStatementLinks,
  skipStatementLines,
  undoStatementCreates,
  voidStatementImport,
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
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(
    () => (importView ? groupLines(importView.lines) : null),
    [importView],
  );

  const reloadFromServer = useCallback(
    async (importId: string) => {
      const { getStatementImport } = await import('@/app/actions/statement-import');
      const view = await getStatementImport(importId);
      if (view) setImportView(view);
    },
    [],
  );

  function uploadFile(file: File) {
    setError(null);
    setInfo(null);
    if (!bankId) {
      setError(si ? 'පළමුව බැංකුව තෝරන්න.' : 'Select a bank account first.');
      return;
    }
    const fd = new FormData();
    fd.set('file', file);
    fd.set('bankAccountId', bankId);
    fd.set('source', source);
    if (bookDomain) fd.set('bookDomain', bookDomain);

    startTransition(() => {
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
        await reloadFromServer(res.importId);
      });
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
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
            : `Confirmed ${res.linked} match${res.linked === 1 ? '' : 'es'}.`,
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
          res.errors.length > 0 ? ` (${res.errors.length} issue${res.errors.length > 1 ? 's' : ''})` : '';
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
      !window.confirm(
        si ? 'මෙම උඩුගත කිරීම ඉවත් කරන්නද?' : 'Discard this import review?',
      )
    ) {
      return;
    }
    startTransition(() => {
      voidStatementImport(importView.id).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setImportView(null);
        setInfo(si ? 'ඉවත් කළා' : 'Import discarded.');
      });
    });
  }

  const shellClass = variant === 'cashbook' ? 'stmt-wizard cashbook-stmt' : 'stmt-wizard erp-stmt';

  return (
    <div className={shellClass}>
      {/* Step 1: bank */}
      <section className="stmt-section">
        <h2 className="stmt-h2">
          <Landmark size={20} />
          {si ? '1. බැංකුව තෝරන්න' : '1. Choose bank'}
        </h2>
        <p className="stmt-hint">
          {si
            ? 'එක් වරකට එක් ගිණුමක්. මාසික Excel ලේසිමයි.'
            : 'One account per upload. Monthly Excel is easiest.'}
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

      {/* Step 2: upload */}
      <section className="stmt-section">
        <h2 className="stmt-h2">
          <Upload size={20} />
          {si ? '2. Excel / CSV උඩුගත කරන්න' : '2. Upload Excel / CSV'}
        </h2>
        <div
          className={`stmt-drop ${dragOver ? 'over' : ''} ${pending ? 'busy' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !pending && !importView && fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
          }}
        >
          {pending ? (
            <Loader2 className="spin" size={28} />
          ) : (
            <FileSpreadsheet size={28} />
          )}
          <div>
            <strong>
              {importView
                ? importView.fileName
                : si
                  ? 'ගෙනැවිත් දමන්න හෝ තෝරන්න'
                  : 'Drag & drop or click to choose'}
            </strong>
            <small>
              {si
                ? 'බැංකුවෙන් බාගත කළ .xlsx හෝ .csv (මාසයකට එකක් හොඳයි)'
                : 'Bank export .xlsx / .csv — one month per file is best'}
            </small>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            hidden
            disabled={pending || Boolean(importView)}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f);
              e.target.value = '';
            }}
          />
        </div>
        {importView ? (
          <p className="stmt-meta">
            {importView.bankAccountName ?? 'Bank'} · {importView.periodFrom ?? '—'} →{' '}
            {importView.periodTo ?? '—'} · {importView.rowCount} lines
            {importView.multiMonth ? (
              <span className="stmt-flag warn">
                {' '}
                {si ? '· බහු මාස' : '· Multi-month file'}
              </span>
            ) : null}
          </p>
        ) : null}
      </section>

      {error ? <p className="form-error stmt-msg">{error}</p> : null}
      {info ? <p className="stmt-info stmt-msg">{info}</p> : null}

      {/* Step 3: review */}
      {importView && groups ? (
        <section className="stmt-section">
          <h2 className="stmt-h2">
            <CheckCircle2 size={20} />
            {si ? '3. පරීක්ෂා කර තහවුරු කරන්න' : '3. Review & confirm'}
          </h2>
          <p className="stmt-hint">
            {si
              ? 'කිසිවක් පොතට නොයයි තහවුරු කරන තුරු.'
              : 'Nothing is written to your books until you confirm.'}
          </p>

          <div className="stmt-summary">
            <div className="stmt-sum green">
              <strong>{groups.pendingLink.length}</strong>
              <span>{si ? 'ගැලපේ' : 'Match books'}</span>
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
              <span>{si ? 'දෙවරක්' : 'Already in'}</span>
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
                ? `ගැලපීම් තහවුරු (${groups.pendingLink.length})`
                : `Confirm matches (${groups.pendingLink.length})`}
            </button>
            <button
              type="button"
              className="stmt-btn accent"
              disabled={pending || groups.pendingCreate.length === 0}
              onClick={confirmCreates}
            >
              {pending ? <Loader2 size={16} className="spin" /> : <PlusCircle size={16} />}
              {si
                ? `නව එකතු කරන්න (${groups.pendingCreate.length})`
                : `Add new entries (${groups.pendingCreate.length})`}
            </button>
            <button
              type="button"
              className="stmt-btn secondary"
              disabled={pending || groups.review.length === 0}
              onClick={skipReviews}
            >
              <SkipForward size={16} />
              {si ? 'පරීක්ෂා මඟ හරින්න' : 'Skip checks'}
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
            <button
              type="button"
              className="stmt-btn danger"
              disabled={pending}
              onClick={discardImport}
            >
              <Trash2 size={16} />
              {si ? 'ඉවත් කරන්න' : 'Discard'}
            </button>
          </div>

          <LineGroup
            title={si ? 'නිල් — පොතේ නැත (නව)' : 'New — not in your books yet'}
            tone="blue"
            lines={groups.pendingCreate}
            empty={si ? 'නව නැත' : 'No new lines'}
          />
          <LineGroup
            title={si ? 'කොළ — පොතේ තිබේ' : 'Matches — already in your books'}
            tone="green"
            lines={groups.pendingLink}
            empty={si ? 'ගැලපීම් නැත' : 'No matches to confirm'}
          />
          <LineGroup
            title={si ? 'කහ — ඔබේ ඇස් අවශ්‍යයි' : 'Check — needs your eyes'}
            tone="amber"
            lines={groups.review}
            empty={si ? 'හොඳයි' : 'Nothing ambiguous'}
          />
          <LineGroup
            title={si ? 'දැනටමත් ආයාත' : 'Already imported before'}
            tone="grey"
            lines={groups.duplicate}
            empty=""
          />
          <LineGroup
            title={si ? 'අවසන්' : 'Finished'}
            tone="muted"
            lines={groups.done}
            empty=""
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
}: {
  title: string;
  tone: string;
  lines: StatementLineView[];
  empty: string;
}) {
  if (lines.length === 0 && !empty) return null;
  return (
    <div className={`stmt-group tone-${tone}`}>
      <h3>
        {title} <span className="stmt-count">{lines.length}</span>
      </h3>
      {lines.length === 0 ? (
        empty ? <p className="stmt-empty">{empty}</p> : null
      ) : (
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
              {lines.slice(0, 80).map((l) => (
                <tr key={l.id}>
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
          {lines.length > 80 ? (
            <p className="stmt-empty">Showing first 80 of {lines.length}</p>
          ) : null}
        </div>
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
