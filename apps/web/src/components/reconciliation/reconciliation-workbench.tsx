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
  Plus,
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

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const TABS: { id: string; label: string; short: string }[] = [
  { id: 'decision', label: 'Needs decision', short: 'Decide' },
  { id: 'add', label: 'Add to BookOne', short: 'Add' },
  { id: 'ready', label: 'Ready to confirm', short: 'Ready' },
  { id: 'waiting', label: 'Waiting to clear', short: 'Waiting' },
  { id: 'duplicates', label: 'Duplicates', short: 'Dupes' },
  { id: 'completed', label: 'Completed', short: 'Done' },
  { id: 'all', label: 'All', short: 'All' },
];

function resultTone(row: ReconCaseRow): string {
  if (row.state === 'confirmed' || row.state === 'excluded') return 'ok';
  if (row.caseType === 'create_entry') return 'add';
  if (row.caseType === 'outstanding_book') return 'wait';
  if (row.caseType === 'match_1_1' && row.confidence === 'strong') return 'ready';
  if (row.caseType === 'match_1_1') return 'decide';
  return 'muted';
}

/**
 * Two-sided reconciliation workbench (spec Screen 2).
 * Summary first, then work tabs; mobile card list + desktop table.
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
  const [tab, setTab] = useState('auto');
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
            if (t === 'auto' || res.detail.activeTab !== t) {
              setTab(res.detail.activeTab);
            }
            setError(null);
          },
        );
      });
    },
    [sessionId, tab, page, q],
  );

  useEffect(() => {
    load('auto', 1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function changeTab(t: string) {
    setTab(t);
    setPage(1);
    setSelected(null);
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
        const s = res.stats;
        if (s) {
          setInfo(
            `Suggestions updated · bank lines ${s.workLines} (open ${s.openBank}) · ` +
              `matched ${s.createdMatch} · add ${s.createdAdd} · waiting ${s.createdWait}` +
              (s.statusSample && Object.keys(s.statusSample).length
                ? ` · statuses ${JSON.stringify(s.statusSample)}`
                : ''),
          );
        } else {
          setInfo('Suggestions updated.');
        }
        load(tab === 'auto' ? 'auto' : tab, 1, q);
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
  const counts = detail.tabCounts;
  const totalPages = Math.max(1, Math.ceil(detail.totalCases / detail.pageSize));
  const bankClose = s.statementClosingBalance;
  const bookClose = s.bookClosingBalance;
  const diff =
    bankClose != null && bookClose != null
      ? Math.round((bankClose - bookClose - s.outstandingNet) * 100) / 100
      : s.differenceAmount;
  const workLeft =
    (counts.decision ?? 0) + (counts.add ?? 0) + (counts.ready ?? 0) + (counts.waiting ?? 0);
  const readyN = counts.ready ?? 0;

  function rowActions(row: ReconCaseRow, block = false) {
    const cls = block ? 'bis-btn primary bis-btn-block' : 'bis-btn primary';
    const clsSec = block ? 'bis-btn secondary bis-btn-block' : 'bis-btn secondary';
    return (
      <>
        {row.caseType === 'match_1_1' && row.state !== 'confirmed' ? (
          <button type="button" className={cls} disabled={pending} onClick={() => doConfirm(row.id)}>
            Confirm
          </button>
        ) : null}
        {row.caseType === 'match_1_1' && row.state === 'confirmed' ? (
          <button type="button" className={clsSec} disabled={pending} onClick={() => doUndo(row.id)}>
            <Unlink size={14} />
            Unlink
          </button>
        ) : null}
        {row.caseType === 'outstanding_book' && row.state !== 'confirmed' ? (
          <button
            type="button"
            className={clsSec}
            disabled={pending}
            onClick={() => doOutstanding(row.id)}
          >
            Still waiting
          </button>
        ) : null}
        {row.caseType === 'create_entry' && createHref ? (
          <Link href={createHref} className={clsSec}>
            <Plus size={14} />
            Add…
          </Link>
        ) : null}
        {row.state === 'confirmed' || row.state === 'excluded' ? (
          <CheckCircle2 size={16} className="brw-done-icon" aria-label="Done" />
        ) : null}
      </>
    );
  }

  function SideCell({
    side,
    empty,
  }: {
    side: { date: string | null; description: string | null; amount: number | null };
    empty: string;
  }) {
    if (!side.date && side.amount == null) {
      return <span className="brw-muted">{empty}</span>;
    }
    return (
      <>
        <div className="brw-cell-date">{formatDate(side.date)}</div>
        <div className="brw-cell-desc" title={side.description ?? undefined}>
          {side.description || '—'}
        </div>
        <div className={(side.amount ?? 0) < 0 ? 'brw-amt out' : 'brw-amt in'}>
          {formatRs(side.amount)}
        </div>
      </>
    );
  }

  return (
    <div className="brw">
      <header className="brw-head">
        <div>
          <Link href={inboxHref} className="brw-back">
            ← Bank reconciliations
          </Link>
          <h1 className="brw-title">
            {s.bankName}
            {s.bankCode ? ` · ${s.bankCode}` : ''}
          </h1>
          <p className="brw-sub">
            <span className="brw-period-pill">{s.periodLabel}</span>
            {s.sourceFileCount > 0 ? (
              <span>
                {' '}
                · {s.sourceFileCount} file{s.sourceFileCount === 1 ? '' : 's'}
                {s.sourceFiles[0] ? ` · ${s.sourceFiles.map((f) => f.fileName).join(', ')}` : ''}
              </span>
            ) : null}
          </p>
        </div>
        <div className="brw-head-actions">
          <button type="button" className="bis-btn secondary" disabled={pending} onClick={doRebuild}>
            <RefreshCw size={14} className={pending ? 'spin' : undefined} />
            Refresh
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

      {/* Spec: summary first — what needs attention */}
      <div className="brw-attention" aria-label="What needs attention">
        <button
          type="button"
          className={`brw-chip decide ${tab === 'decision' ? 'active' : ''}`}
          onClick={() => changeTab('decision')}
        >
          Needs decision <em>{counts.decision ?? 0}</em>
        </button>
        <button
          type="button"
          className={`brw-chip add ${tab === 'add' ? 'active' : ''}`}
          onClick={() => changeTab('add')}
        >
          Add to BookOne <em>{counts.add ?? 0}</em>
        </button>
        <button
          type="button"
          className={`brw-chip ready ${tab === 'ready' ? 'active' : ''}`}
          onClick={() => changeTab('ready')}
        >
          Ready to confirm <em>{readyN}</em>
        </button>
        <button
          type="button"
          className={`brw-chip wait ${tab === 'waiting' ? 'active' : ''}`}
          onClick={() => changeTab('waiting')}
        >
          Waiting to clear <em>{counts.waiting ?? 0}</em>
        </button>
        {(counts.duplicates ?? 0) > 0 ? (
          <button
            type="button"
            className={`brw-chip muted ${tab === 'duplicates' ? 'active' : ''}`}
            onClick={() => changeTab('duplicates')}
          >
            Duplicates <em>{counts.duplicates}</em>
          </button>
        ) : null}
        <button
          type="button"
          className={`brw-chip muted ${tab === 'completed' ? 'active' : ''}`}
          onClick={() => changeTab('completed')}
        >
          Completed <em>{counts.completed ?? 0}</em>
        </button>
      </div>

      <div className="brw-progress-block">
        <div className="brw-progress-meta">
          <strong>
            {s.resolvedCaseCount} of{' '}
            {Math.max(s.resolvedCaseCount + s.openCaseCount, s.bankLineCount, 1)} resolved
            {workLeft > 0 ? (
              <span className="brw-work-left"> · {workLeft} still need a look</span>
            ) : (
              <span className="brw-work-done"> · All clear</span>
            )}
          </strong>
          <div className="brw-progress-actions">
            {readyN > 0 ? (
              <button
                type="button"
                className="bis-btn primary"
                disabled={pending}
                onClick={doBulkStrong}
              >
                <Link2 size={14} />
                Confirm safe matches ({readyN})
              </button>
            ) : null}
          </div>
        </div>
        <div className="brw-progress-bar tall" aria-hidden>
          <i style={{ width: `${s.progressPct}%` }} />
        </div>
      </div>

      <div className="brw-tabs" role="tablist">
        {TABS.map((t) => {
          const n = counts[t.id] ?? 0;
          // Hide empty secondary tabs to reduce noise
          if ((t.id === 'duplicates' || t.id === 'completed') && n === 0 && tab !== t.id) {
            return null;
          }
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`brw-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => changeTab(t.id)}
            >
              <span className="brw-tab-full">{t.label}</span>
              <span className="brw-tab-short">{t.short}</span>
              <em>{n}</em>
            </button>
          );
        })}
      </div>

      <div className="brw-toolbar">
        <input
          className="brw-search"
          placeholder="Search description…"
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

      {/* Desktop table */}
      <div className="brw-table-wrap table-wrap brw-desktop-only">
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
                <td colSpan={5} className="brw-empty-cell">
                  {pending ? 'Loading…' : emptyTabMessage(tab)}
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
                    <SideCell side={row.bank} empty="No bank transaction" />
                  </td>
                  <td className="brw-conn" aria-hidden>
                    {row.connection === 'match'
                      ? '↔'
                      : row.connection === 'bank_only'
                        ? '→'
                        : '←'}
                  </td>
                  <td>
                    <SideCell side={row.book} empty="No BookOne record" />
                  </td>
                  <td>
                    <span className={`brw-result tone-${resultTone(row)}`}>
                      {row.resultLabel ?? row.userLabel ?? '—'}
                    </span>
                  </td>
                  <td className="brw-row-actions" onClick={(e) => e.stopPropagation()}>
                    {rowActions(row)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="brw-cards-list brw-mobile-only">
        {detail.cases.length === 0 ? (
          <div className="brw-empty-cell">{pending ? 'Loading…' : emptyTabMessage(tab)}</div>
        ) : (
          detail.cases.map((row) => (
            <article
              key={row.id}
              className={`brw-case-card ${selected?.id === row.id ? 'selected' : ''}`}
              onClick={() => setSelected(row)}
            >
              <div className="brw-case-card-head">
                <span className={`brw-result tone-${resultTone(row)}`}>
                  {row.resultLabel ?? row.userLabel ?? '—'}
                </span>
                <span className="brw-case-conn" aria-hidden>
                  {row.connection === 'match'
                    ? 'Match'
                    : row.connection === 'bank_only'
                      ? 'Bank only'
                      : 'Book only'}
                </span>
              </div>
              <div className="brw-case-sides">
                <div className="brw-case-side">
                  <span className="brw-case-side-label">Bank</span>
                  <SideCell side={row.bank} empty="—" />
                </div>
                <div className="brw-case-side">
                  <span className="brw-case-side-label">BookOne</span>
                  <SideCell side={row.book} empty="—" />
                </div>
              </div>
              <div className="brw-row-actions" onClick={(e) => e.stopPropagation()}>
                {rowActions(row)}
              </div>
            </article>
          ))
        )}
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
            <strong>{selected.userLabel ?? selected.resultLabel ?? 'Details'}</strong>
            <button type="button" className="bis-btn secondary" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <p className="brw-explain">{selected.explanation ?? '—'}</p>
          {selected.reasonCodes.length > 0 ? (
            <p className="brw-muted">Why: {selected.reasonCodes.join(', ')}</p>
          ) : null}
          <div className="brw-drawer-sides">
            <div>
              <span className="brw-case-side-label">Bank</span>
              <SideCell side={selected.bank} empty="No bank transaction" />
            </div>
            <div>
              <span className="brw-case-side-label">BookOne</span>
              <SideCell side={selected.book} empty="No BookOne record" />
            </div>
          </div>
          <div className="brw-drawer-actions">{rowActions(selected, true)}</div>
        </aside>
      ) : null}
    </div>
  );
}

function emptyTabMessage(tab: string) {
  switch (tab) {
    case 'decision':
      return 'Nothing needs a decision right now.';
    case 'add':
      return 'No bank transactions waiting to be added.';
    case 'ready':
      return 'No strong matches ready to confirm.';
    case 'waiting':
      return 'No BookOne records waiting to clear the bank.';
    case 'duplicates':
      return 'No duplicates.';
    case 'completed':
      return 'Nothing completed yet.';
    default:
      return 'Nothing in this tab.';
  }
}
