'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  Link2,
  Unlink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  bulkConfirmStrongMatches,
  confirmCaseMatch,
  markCaseOutstanding,
  openReconciliationSession,
  rebuildSessionSuggestions,
  undoCaseMatch,
  type ReconCaseRow,
  type ReconSessionDetail,
} from '@/app/actions/bank-reconciliation';

function formatRs(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(n).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready to confirm' },
  { id: 'decision', label: 'Needs decision' },
  { id: 'add', label: 'Add to BookOne' },
  { id: 'waiting', label: 'Waiting to clear' },
  { id: 'duplicates', label: 'Duplicates' },
  { id: 'completed', label: 'Completed' },
];

/**
 * Two-sided reconciliation workbench (spec Screen 2).
 * BookOne table + card patterns; plain-language labels only.
 */
export function ReconciliationWorkbench({
  sessionId,
  inboxHref,
  createHref,
}: {
  sessionId: string;
  inboxHref: string;
  /** Where to send user for create flow of bank-only (reuse match create later) */
  createHref?: string;
}) {
  const [detail, setDetail] = useState<ReconSessionDetail | null>(null);
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReconCaseRow | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(
    (t = tab, p = page, query = q) => {
      startTransition(() => {
        openReconciliationSession(sessionId, { tab: t, page: p, pageSize: 20, q: query }).then(
          (res) => {
            if (!res.ok) {
              setError(res.error);
              return;
            }
            setDetail(res.detail);
            setError(null);
          },
        );
      });
    },
    [sessionId, tab, page, q],
  );

  useEffect(() => {
    load('all', 1, '');
    // initial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function changeTab(t: string) {
    setTab(t);
    setPage(1);
    load(t, 1, q);
  }

  function doRebuild() {
    setInfo(null);
    startTransition(() => {
      rebuildSessionSuggestions(sessionId).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo('Suggestions updated.');
        load(tab, page, q);
      });
    });
  }

  function doBulkStrong() {
    if (!window.confirm('Confirm all strong matches? BookOne will only link existing entries.')) {
      return;
    }
    startTransition(() => {
      bulkConfirmStrongMatches(sessionId).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo(`Confirmed ${res.confirmed} match${res.confirmed === 1 ? '' : 'es'}.`);
        load(tab, page, q);
      });
    });
  }

  function doConfirm(caseId: string) {
    startTransition(() => {
      confirmCaseMatch({ caseId }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSelected(null);
        load(tab, page, q);
      });
    });
  }

  function doUndo(caseId: string) {
    startTransition(() => {
      undoCaseMatch({ caseId }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSelected(null);
        load(tab, page, q);
      });
    });
  }

  function doOutstanding(caseId: string) {
    startTransition(() => {
      markCaseOutstanding({ caseId }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSelected(null);
        load(tab, page, q);
      });
    });
  }

  if (!detail && pending) {
    return (
      <div className="brw-loading">
        <Loader2 className="spin" size={22} />
        Loading reconciliation…
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="brw-loading">
        {error ?? 'Session not found.'}
        <Link href={inboxHref} className="bis-btn secondary" style={{ marginTop: 12 }}>
          Back
        </Link>
      </div>
    );
  }

  const s = detail.session;
  const totalPages = Math.max(1, Math.ceil(detail.totalCases / detail.pageSize));
  const bankClose = s.statementClosingBalance;
  const bookClose = s.bookClosingBalance;
  const diff =
    bankClose != null && bookClose != null
      ? Math.round((bankClose - bookClose - s.outstandingNet) * 100) / 100
      : s.differenceAmount;

  return (
    <div className="brw">
      <header className="brw-head">
        <div>
          <Link href={inboxHref} className="brw-back">
            ← Bank reconciliations
          </Link>
          <h1 className="brw-title">
            {s.bankName}
            <span className="brw-period"> · {s.periodLabel}</span>
          </h1>
          <p className="brw-sub">
            {s.sourceFileCount} source file{s.sourceFileCount === 1 ? '' : 's'}
            {s.sourceFiles[0] ? ` · ${s.sourceFiles.map((f) => f.fileName).join(', ')}` : ''}
          </p>
        </div>
        <div className="brw-head-actions">
          <button type="button" className="bis-btn secondary" disabled={pending} onClick={doRebuild}>
            <RefreshCw size={14} />
            Refresh suggestions
          </button>
        </div>
      </header>

      <div className="brw-cards">
        <div className="brw-card">
          <span>Bank closing</span>
          <strong>{formatRs(bankClose)}</strong>
        </div>
        <div className="brw-card">
          <span>BookOne balance</span>
          <strong>{formatRs(bookClose)}</strong>
        </div>
        <div className="brw-card">
          <span>Explained timing</span>
          <strong>{formatRs(s.outstandingNet)}</strong>
        </div>
        <div className={`brw-card emphasize ${Math.abs(diff) < 0.02 ? 'ok' : 'warn'}`}>
          <span>Difference left</span>
          <strong>{formatRs(diff)}</strong>
        </div>
      </div>

      <div className="brw-progress-block">
        <div className="brw-progress-meta">
          <strong>
            {s.resolvedCaseCount} of{' '}
            {Math.max(s.resolvedCaseCount + s.openCaseCount, s.bankLineCount, 1)} resolved
          </strong>
          <div className="brw-progress-actions">
            <button
              type="button"
              className="bis-btn primary"
              disabled={pending || (detail.tabCounts.ready ?? 0) === 0}
              onClick={doBulkStrong}
            >
              <Link2 size={14} />
              Confirm safe matches ({detail.tabCounts.ready ?? 0})
            </button>
          </div>
        </div>
        <div className="brw-progress-bar tall" aria-hidden>
          <i style={{ width: `${s.progressPct}%` }} />
        </div>
      </div>

      <div className="brw-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`brw-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => changeTab(t.id)}
          >
            {t.label}
            <em>{detail.tabCounts[t.id] ?? 0}</em>
          </button>
        ))}
      </div>

      <div className="brw-toolbar">
        <input
          className="brw-search"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1);
              load(tab, 1, q);
            }
          }}
        />
        <button
          type="button"
          className="bis-btn secondary"
          disabled={pending}
          onClick={() => {
            setPage(1);
            load(tab, 1, q);
          }}
        >
          Search
        </button>
      </div>

      {error ? <p className="bis-error">{error}</p> : null}
      {info ? <p className="bis-match-info">{info}</p> : null}

      <div className="brw-table-wrap table-wrap">
        <table className="table brw-table">
          <thead>
            <tr>
              <th>Bank transaction</th>
              <th className="brw-conn"> </th>
              <th>BookOne record</th>
              <th>Result</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {detail.cases.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-muted)' }}>
                  {pending ? 'Loading…' : 'Nothing in this tab.'}
                </td>
              </tr>
            ) : (
              detail.cases.map((row) => (
                <tr
                  key={row.id}
                  className={selected?.id === row.id ? 'selected' : ''}
                  onClick={() => setSelected(row)}
                >
                  <td>
                    {row.bank.date ? (
                      <>
                        <div className="brw-cell-date">{row.bank.date}</div>
                        <div className="brw-cell-desc">{row.bank.description}</div>
                        <div
                          className={
                            (row.bank.amount ?? 0) < 0 ? 'brw-amt out' : 'brw-amt in'
                          }
                        >
                          {formatRs(row.bank.amount)}
                        </div>
                      </>
                    ) : (
                      <span className="brw-muted">No bank transaction</span>
                    )}
                  </td>
                  <td className="brw-conn">
                    {row.connection === 'match'
                      ? '↔'
                      : row.connection === 'bank_only'
                        ? '→'
                        : '←'}
                  </td>
                  <td>
                    {row.book.date ? (
                      <>
                        <div className="brw-cell-date">{row.book.date}</div>
                        <div className="brw-cell-desc">{row.book.description}</div>
                        <div
                          className={
                            (row.book.amount ?? 0) < 0 ? 'brw-amt out' : 'brw-amt in'
                          }
                        >
                          {formatRs(row.book.amount)}
                        </div>
                      </>
                    ) : (
                      <span className="brw-muted">No BookOne record</span>
                    )}
                  </td>
                  <td>
                    <span className="brw-result">{row.resultLabel ?? row.userLabel ?? '—'}</span>
                  </td>
                  <td className="brw-row-actions" onClick={(e) => e.stopPropagation()}>
                    {row.caseType === 'match_1_1' && row.state !== 'confirmed' ? (
                      <button
                        type="button"
                        className="bis-btn primary"
                        disabled={pending}
                        onClick={() => doConfirm(row.id)}
                      >
                        Confirm
                      </button>
                    ) : null}
                    {row.caseType === 'match_1_1' && row.state === 'confirmed' ? (
                      <button
                        type="button"
                        className="bis-btn secondary"
                        disabled={pending}
                        onClick={() => doUndo(row.id)}
                      >
                        <Unlink size={14} />
                        Unlink
                      </button>
                    ) : null}
                    {row.caseType === 'outstanding_book' && row.state !== 'confirmed' ? (
                      <button
                        type="button"
                        className="bis-btn secondary"
                        disabled={pending}
                        onClick={() => doOutstanding(row.id)}
                      >
                        Still waiting
                      </button>
                    ) : null}
                    {row.caseType === 'create_entry' && createHref ? (
                      <Link href={createHref} className="bis-btn secondary">
                        Add…
                      </Link>
                    ) : null}
                    {row.state === 'confirmed' || row.state === 'excluded' ? (
                      <CheckCircle2 size={16} className="brw-done-icon" />
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="brw-pager">
        <span>
          {detail.totalCases} total · page {page} of {totalPages}
        </span>
        <div className="brw-pager-btns">
          <button
            type="button"
            className="bis-btn secondary"
            disabled={pending || page <= 1}
            onClick={() => {
              const p = page - 1;
              setPage(p);
              load(tab, p, q);
            }}
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <button
            type="button"
            className="bis-btn secondary"
            disabled={pending || page >= totalPages}
            onClick={() => {
              const p = page + 1;
              setPage(p);
              load(tab, p, q);
            }}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {selected ? (
        <aside className="brw-drawer" aria-label="Case detail">
          <div className="brw-drawer-head">
            <strong>{selected.userLabel ?? 'Details'}</strong>
            <button type="button" className="bis-btn secondary" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <p className="brw-explain">{selected.explanation ?? '—'}</p>
          {selected.reasonCodes.length > 0 ? (
            <p className="brw-muted">Why: {selected.reasonCodes.join(', ')}</p>
          ) : null}
          <div className="brw-drawer-actions">
            {selected.caseType === 'match_1_1' && selected.state !== 'confirmed' ? (
              <button
                type="button"
                className="bis-btn primary bis-btn-block"
                disabled={pending}
                onClick={() => doConfirm(selected.id)}
              >
                Confirm this match
              </button>
            ) : null}
            {selected.caseType === 'match_1_1' && selected.state === 'confirmed' ? (
              <button
                type="button"
                className="bis-btn secondary bis-btn-block"
                disabled={pending}
                onClick={() => doUndo(selected.id)}
              >
                Unlink match
              </button>
            ) : null}
            {selected.caseType === 'outstanding_book' && selected.state !== 'confirmed' ? (
              <button
                type="button"
                className="bis-btn primary bis-btn-block"
                disabled={pending}
                onClick={() => doOutstanding(selected.id)}
              >
                Mark as waiting to clear
              </button>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
