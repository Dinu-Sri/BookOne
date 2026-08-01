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
  ArrowRightLeft,
  Ban,
  ClipboardCheck,
  Download,
  ListOrdered,
  FileText,
  Layers,
} from 'lucide-react';
import {
  bulkConfirmStrongMatches,
  confirmCaseMatch,
  confirmGroupMatch,
  confirmManyBanksOneBook,
  confirmTransferCase,
  createCaseEntry,
  excludeCase,
  exportReconciliationSummary,
  finishReconciliationSession,
  listUnmatchedBankLinesForSession,
  markCaseOutstanding,
  openReconciliationSession,
  rebuildSessionSuggestions,
  rejectTransferCase,
  reopenReconciliationSession,
  searchBookForSession,
  searchGroupBookCandidates,
  undoCaseMatch,
  type ReconCaseRow,
  type ReconSessionDetail,
  type UnmatchedBankLineOption,
} from '@/app/actions/bank-reconciliation';
import { listLiquidAccounts, type LiquidAccount } from '@/app/actions/cashbook-banks';

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
  { id: 'transfers', label: 'Transfers', short: 'Xfer' },
  { id: 'add', label: 'Add to BookOne', short: 'Add' },
  { id: 'ready', label: 'Ready to confirm', short: 'Ready' },
  { id: 'waiting', label: 'Waiting to clear', short: 'Waiting' },
  { id: 'duplicates', label: 'Duplicates', short: 'Dupes' },
  { id: 'completed', label: 'Completed', short: 'Done' },
  { id: 'all', label: 'All', short: 'All' },
];

function resultTone(row: ReconCaseRow): string {
  if (row.state === 'confirmed' || row.state === 'excluded') return 'ok';
  if (row.caseType === 'create_entry' || row.caseType === 'group_match') return 'add';
  if (row.caseType === 'transfer') return 'decide';
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [liquid, setLiquid] = useState<LiquidAccount[]>([]);
  const [xferTo, setXferTo] = useState('');
  const [groupCands, setGroupCands] = useState<
    { id: string; date: string; description: string; amountSigned: number }[]
  >([]);
  const [groupBankAmt, setGroupBankAmt] = useState<number | null>(null);
  const [groupSelected, setGroupSelected] = useState<string[]>([]);
  const [groupQ, setGroupQ] = useState('');
  const [xferFee, setXferFee] = useState('');
  const [manyOpen, setManyOpen] = useState(false);
  const [manyBanks, setManyBanks] = useState<UnmatchedBankLineOption[]>([]);
  const [manySelectedLines, setManySelectedLines] = useState<string[]>([]);
  const [manyBooks, setManyBooks] = useState<
    { id: string; date: string; description: string; amountSigned: number }[]
  >([]);
  const [manyBookId, setManyBookId] = useState('');
  const [manyQ, setManyQ] = useState('');

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
    listLiquidAccounts().then(setLiquid).catch(() => setLiquid([]));
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

  function doCreate(caseId: string) {
    if (
      !window.confirm(
        'Add this bank transaction to BookOne? It posts a real cashbook entry (Other expense / Other income by default).',
      )
    ) {
      return;
    }
    startTransition(() => {
      createCaseEntry({ caseId }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo('Added to BookOne.');
        setSelected(null);
        load(tab, page, q);
      });
    });
  }

  function doFinish() {
    if (
      !window.confirm(
        'Mark this period as reconciled? Only when difference is zero and open items are done. This does not close the accounting period.',
      )
    ) {
      return;
    }
    startTransition(() => {
      finishReconciliationSession(sessionId).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo('Reconciliation finished — bank and BookOne agree.');
        setReviewOpen(false);
        load(tab, page, q);
      });
    });
  }

  function doReopen() {
    if (!window.confirm('Reopen this reconciliation for more work?')) return;
    startTransition(() => {
      reopenReconciliationSession(sessionId).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo('Reopened — you can continue matching.');
        load('auto', 1, q);
      });
    });
  }

  function doTransferConfirm(caseId: string) {
    if (!xferTo) {
      setError('Choose the other account for this transfer.');
      return;
    }
    const fee = Math.max(0, Number(xferFee) || 0);
    const feeNote =
      fee > 0
        ? ` Transfer Rs. net of fee, plus bank fee Rs. ${fee.toFixed(2)}.`
        : '';
    if (
      !window.confirm(
        `Post this as a transfer (move money) between your accounts?${feeNote}`,
      )
    )
      return;
    startTransition(() => {
      confirmTransferCase({
        caseId,
        counterpartyAccountCode: xferTo,
        feeAmount: fee > 0 ? fee : undefined,
      }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo(
          fee > 0
            ? `Transfer posted with fee Rs. ${fee.toFixed(2)}.`
            : 'Transfer posted.',
        );
        setSelected(null);
        setXferFee('');
        load(tab, page, q);
      });
    });
  }

  function openManyToOne() {
    setManyOpen(true);
    setManySelectedLines([]);
    setManyBookId('');
    startTransition(() => {
      listUnmatchedBankLinesForSession(sessionId).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setManyBanks(res.lines);
      });
    });
  }

  function searchManyBooks() {
    const target = manySelectedLines
      .map((id) => manyBanks.find((b) => b.lineId === id)?.amount ?? 0)
      .reduce((a, b) => a + b, 0);
    startTransition(() => {
      searchBookForSession({
        sessionId,
        q: manyQ,
        targetAmount: target || undefined,
      }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setManyBooks(res.candidates);
      });
    });
  }

  function doManyToOne() {
    if (manySelectedLines.length < 2) {
      setError('Select at least two bank lines.');
      return;
    }
    if (!manyBookId) {
      setError('Select one BookOne record.');
      return;
    }
    startTransition(() => {
      confirmManyBanksOneBook({
        sessionId,
        bankLineIds: manySelectedLines,
        transactionId: manyBookId,
      }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo(`Matched ${manySelectedLines.length} bank lines to one BookOne record.`);
        setManyOpen(false);
        load(tab, page, q);
      });
    });
  }

  function doTransferReject(caseId: string) {
    startTransition(() => {
      rejectTransferCase({ caseId }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo('Marked as normal entry — use Add to BookOne.');
        setSelected(null);
        load(tab, page, q);
      });
    });
  }

  function doExclude(caseId: string) {
    const reason = window.prompt('Why exclude this item?', 'not_relevant') ?? '';
    if (!reason.trim()) return;
    startTransition(() => {
      excludeCase({ caseId, reason: reason.trim() }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo('Excluded.');
        setSelected(null);
        load(tab, page, q);
      });
    });
  }

  function loadGroupCandidates(caseId: string, query = '') {
    startTransition(() => {
      searchGroupBookCandidates({ caseId, q: query }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setGroupCands(res.candidates);
        setGroupBankAmt(res.bankAmount);
        setGroupSelected([]);
      });
    });
  }

  function doGroupConfirm(caseId: string) {
    if (groupSelected.length === 0) {
      setError('Select at least one BookOne record.');
      return;
    }
    startTransition(() => {
      confirmGroupMatch({ caseId, transactionIds: groupSelected }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo('Grouped match confirmed.');
        setSelected(null);
        setGroupCands([]);
        load(tab, page, q);
      });
    });
  }

  function doExport() {
    startTransition(() => {
      exportReconciliationSummary(sessionId).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const blob = new Blob([JSON.stringify(res.summary, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recon-${sessionId.slice(0, 8)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setInfo('Summary downloaded.');
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
    (counts.decision ?? 0) +
    (counts.add ?? 0) +
    (counts.ready ?? 0) +
    (counts.waiting ?? 0) +
    (counts.transfers ?? 0);
  const readyN = counts.ready ?? 0;
  const review = detail.review;
  const otherBanks = liquid.filter(
    (a) => a.code !== s.bankCode && (a.kind === 'bank' || a.kind === 'cash' || a.kind === 'card'),
  );
  const isCashbook = inboxHref.includes('/cashbook');
  const guidedHref = isCashbook
    ? `/cashbook/recon/${sessionId}/guided`
    : `/reconciliation/session/${sessionId}/guided`;
  const reportHref = isCashbook
    ? `/cashbook/recon/${sessionId}/report`
    : `/reconciliation/session/${sessionId}/report`;
  const manyBankSum = manySelectedLines
    .map((id) => manyBanks.find((b) => b.lineId === id)?.amount ?? 0)
    .reduce((a, b) => a + b, 0);

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
        {(row.caseType === 'create_entry' || row.caseType === 'group_match') &&
        row.state !== 'confirmed' ? (
          <button type="button" className={cls} disabled={pending} onClick={() => doCreate(row.id)}>
            <Plus size={14} />
            Add to BookOne
          </button>
        ) : null}
        {row.caseType === 'transfer' && row.state !== 'confirmed' ? (
          <button
            type="button"
            className={cls}
            disabled={pending}
            onClick={() => {
              setSelected(row);
              setXferTo(otherBanks[0]?.code ?? '');
            }}
          >
            <ArrowRightLeft size={14} />
            Transfer…
          </button>
        ) : null}
        {row.state !== 'confirmed' && row.state !== 'excluded' ? (
          <button
            type="button"
            className={clsSec}
            disabled={pending}
            onClick={() => doExclude(row.id)}
            title="Exclude"
          >
            <Ban size={14} />
            {block ? 'Exclude' : null}
          </button>
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
          <Link href={guidedHref} className="bis-btn secondary">
            <ListOrdered size={14} />
            Fix one by one
          </Link>
          <Link href={reportHref} className="bis-btn secondary" target="_blank">
            <FileText size={14} />
            Report
          </Link>
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
          className={`brw-chip decide ${tab === 'transfers' ? 'active' : ''}`}
          onClick={() => changeTab('transfers')}
        >
          Transfers <em>{counts.transfers ?? 0}</em>
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
            <button
              type="button"
              className="bis-btn secondary"
              disabled={pending}
              onClick={openManyToOne}
            >
              <Layers size={14} />
              Many bank → 1 book
            </button>
            <button
              type="button"
              className="bis-btn secondary"
              disabled={pending}
              onClick={() => setReviewOpen((v) => !v)}
            >
              <ClipboardCheck size={14} />
              Review & finish
            </button>
            <button type="button" className="bis-btn secondary" disabled={pending} onClick={doExport}>
              <Download size={14} />
              Export JSON
            </button>
            {s.status === 'reconciled' || s.status === 'reopened' ? (
              s.status === 'reconciled' ? (
                <button
                  type="button"
                  className="bis-btn secondary"
                  disabled={pending}
                  onClick={doReopen}
                >
                  Reopen
                </button>
              ) : null
            ) : null}
            {s.status === 'reconciled' ? (
              <span className="brw-work-done">Reconciled</span>
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
          if (
            (t.id === 'duplicates' || t.id === 'completed' || t.id === 'transfers') &&
            n === 0 &&
            tab !== t.id
          ) {
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

      {reviewOpen && review ? (
        <section className="brw-review" aria-label="Final review">
          <h2 className="brw-review-title">Review reconciliation</h2>
          <p className="brw-muted">
            {s.bankName} · {s.periodLabel}
          </p>
          <ul className="brw-review-stats">
            <li>
              Bank transactions <strong>{review.bankLines}</strong>
            </li>
            <li>
              Matched existing <strong>{review.matched}</strong>
            </li>
            <li>
              Added to BookOne <strong>{review.added}</strong>
            </li>
            <li>
              Transfers <strong>{review.transfers}</strong>
            </li>
            <li>
              Waiting to clear <strong>{review.waiting}</strong>
            </li>
            <li>
              Duplicates / excluded <strong>{review.duplicates}</strong>
            </li>
            <li>
              Needs attention <strong>{review.needsAttention}</strong>
            </li>
          </ul>
          <div className="brw-review-balances">
            <div>
              Bank closing <strong>{formatRs(review.bankClosing)}</strong>
            </div>
            <div>
              BookOne balance <strong>{formatRs(review.bookClosing)}</strong>
            </div>
            <div>
              Timing items <strong>{formatRs(review.outstandingNet)}</strong>
            </div>
            <div className={Math.abs(review.difference) < 0.02 ? 'ok' : 'warn'}>
              Difference left <strong>{formatRs(review.difference)}</strong>
            </div>
          </div>
          {review.finishBlockers.length > 0 ? (
            <p className="bis-error">Still open: {review.finishBlockers.join(' · ')}</p>
          ) : (
            <p className="bis-match-info">
              All clear — difference is zero and nothing needs attention.
            </p>
          )}
          <div className="brw-review-actions">
            <button
              type="button"
              className="bis-btn secondary"
              onClick={() => setReviewOpen(false)}
            >
              Back to workbench
            </button>
            <button
              type="button"
              className="bis-btn primary"
              disabled={pending || !review.canFinish}
              onClick={doFinish}
            >
              <CheckCircle2 size={14} />
              Finish reconciliation
            </button>
          </div>
        </section>
      ) : null}

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
          {selected.caseType === 'transfer' && selected.state !== 'confirmed' ? (
            <div className="brw-xfer-panel">
              <p className="brw-explain">
                If this is money moved between your own accounts, post it as a transfer — not
                income or expense. Optional fee: when money leaves this bank, fee is posted as bank
                charge and the transfer is the remainder (e.g. 100,000 out → 99,500 transfer + 500
                fee).
              </p>
              <label className="brw-field">
                <span>Other account</span>
                <select value={xferTo} onChange={(e) => setXferTo(e.target.value)}>
                  <option value="">Select…</option>
                  {otherBanks.map((a) => (
                    <option key={a.id} value={a.code}>
                      {a.shortName} ({a.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="brw-field">
                <span>Bank fee / adjustment (optional, Rs.)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="brw-search"
                  placeholder="0.00"
                  value={xferFee}
                  onChange={(e) => setXferFee(e.target.value)}
                />
              </label>
              {(selected.bank.amount ?? 0) < 0 && Number(xferFee) > 0 ? (
                <p className="brw-muted">
                  Transfer{' '}
                  {formatRs(Math.abs(selected.bank.amount ?? 0) - Number(xferFee || 0))} · Fee{' '}
                  {formatRs(Number(xferFee))}
                </p>
              ) : null}
              <div className="brw-drawer-actions">
                <button
                  type="button"
                  className="bis-btn primary bis-btn-block"
                  disabled={pending || !xferTo}
                  onClick={() => doTransferConfirm(selected.id)}
                >
                  <ArrowRightLeft size={14} />
                  Yes, post transfer
                  {Number(xferFee) > 0 ? ' + fee' : ''}
                </button>
                <button
                  type="button"
                  className="bis-btn secondary bis-btn-block"
                  disabled={pending}
                  onClick={() => doTransferReject(selected.id)}
                >
                  Not a transfer
                </button>
              </div>
            </div>
          ) : null}

          {(selected.caseType === 'create_entry' ||
            selected.caseType === 'group_match' ||
            selected.caseType === 'match_1_1') &&
          selected.state !== 'confirmed' &&
          selected.bank.lineId ? (
            <div className="brw-group-panel">
              <p className="brw-muted">
                Or match this bank line to one or more BookOne records (sum must match).
              </p>
              <div className="brw-toolbar">
                <input
                  className="brw-search"
                  placeholder="Search BookOne…"
                  value={groupQ}
                  onChange={(e) => setGroupQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadGroupCandidates(selected.id, groupQ);
                  }}
                />
                <button
                  type="button"
                  className="bis-btn secondary"
                  disabled={pending}
                  onClick={() => loadGroupCandidates(selected.id, groupQ)}
                >
                  Find
                </button>
              </div>
              {groupBankAmt != null ? (
                <p className="brw-muted">
                  Bank {formatRs(groupBankAmt)} · selected{' '}
                  {formatRs(
                    groupCands
                      .filter((c) => groupSelected.includes(c.id))
                      .reduce((s, c) => s + c.amountSigned, 0),
                  )}
                </p>
              ) : null}
              <ul className="brw-group-list">
                {groupCands.map((c) => (
                  <li key={c.id}>
                    <label className="brw-group-row">
                      <input
                        type="checkbox"
                        checked={groupSelected.includes(c.id)}
                        onChange={() => {
                          setGroupSelected((prev) =>
                            prev.includes(c.id)
                              ? prev.filter((x) => x !== c.id)
                              : [...prev, c.id],
                          );
                        }}
                      />
                      <span className="brw-cell-date">{formatDate(c.date)}</span>
                      <span className="brw-cell-desc">{c.description}</span>
                      <span className={c.amountSigned < 0 ? 'brw-amt out' : 'brw-amt in'}>
                        {formatRs(c.amountSigned)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {groupSelected.length > 0 ? (
                <button
                  type="button"
                  className="bis-btn primary bis-btn-block"
                  disabled={pending}
                  onClick={() => doGroupConfirm(selected.id)}
                >
                  Confirm group match ({groupSelected.length})
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="brw-drawer-actions">{rowActions(selected, true)}</div>
        </aside>
      ) : null}

      {manyOpen ? (
        <aside className="brw-drawer brw-many-panel" aria-label="Many bank to one book">
          <div className="brw-drawer-head">
            <strong>Many bank lines → one BookOne</strong>
            <button type="button" className="bis-btn secondary" onClick={() => setManyOpen(false)}>
              Close
            </button>
          </div>
          <p className="brw-muted">
            Select 2+ bank lines that make up one BookOne entry (e.g. split deposits). Sum must
            match.
          </p>
          <p className="brw-cell-date">Selected bank total: {formatRs(manyBankSum)}</p>
          <ul className="brw-group-list">
            {manyBanks.length === 0 ? (
              <li className="brw-muted">No open bank lines to group.</li>
            ) : (
              manyBanks.map((l) => (
                <li key={l.lineId}>
                  <label className="brw-group-row">
                    <input
                      type="checkbox"
                      checked={manySelectedLines.includes(l.lineId)}
                      onChange={() => {
                        setManySelectedLines((prev) =>
                          prev.includes(l.lineId)
                            ? prev.filter((x) => x !== l.lineId)
                            : [...prev, l.lineId],
                        );
                      }}
                    />
                    <span className="brw-cell-date">{formatDate(l.date)}</span>
                    <span className="brw-cell-desc">{l.description}</span>
                    <span className={l.amount < 0 ? 'brw-amt out' : 'brw-amt in'}>
                      {formatRs(l.amount)}
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>
          <div className="brw-toolbar">
            <input
              className="brw-search"
              placeholder="Search BookOne record…"
              value={manyQ}
              onChange={(e) => setManyQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') searchManyBooks();
              }}
            />
            <button
              type="button"
              className="bis-btn secondary"
              disabled={pending || manySelectedLines.length < 2}
              onClick={searchManyBooks}
            >
              Find BookOne
            </button>
          </div>
          <ul className="brw-group-list">
            {manyBooks.map((b) => (
              <li key={b.id}>
                <label className="brw-group-row">
                  <input
                    type="radio"
                    name="many-book"
                    checked={manyBookId === b.id}
                    onChange={() => setManyBookId(b.id)}
                  />
                  <span className="brw-cell-date">{formatDate(b.date)}</span>
                  <span className="brw-cell-desc">{b.description}</span>
                  <span className={b.amountSigned < 0 ? 'brw-amt out' : 'brw-amt in'}>
                    {formatRs(b.amountSigned)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="bis-btn primary bis-btn-block"
            disabled={pending || manySelectedLines.length < 2 || !manyBookId}
            onClick={doManyToOne}
          >
            Confirm {manySelectedLines.length} bank → 1 BookOne
          </button>
        </aside>
      ) : null}
    </div>
  );
}

function emptyTabMessage(tab: string) {
  switch (tab) {
    case 'decision':
      return 'Nothing needs a decision right now.';
    case 'transfers':
      return 'No possible transfers to review.';
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
