'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  ArrowRightLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Unlink,
} from 'lucide-react';
import {
  confirmCaseMatch,
  createCaseEntry,
  listGuidedQueue,
  markCaseOutstanding,
  rejectTransferCase,
  undoCaseMatch,
  type ReconCaseRow,
  type ReconSessionListItem,
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

/**
 * Fix-one-by-one guided queue (spec Screen guided).
 */
export function ReconciliationGuided({
  sessionId,
  workbenchHref,
  inboxHref,
}: {
  sessionId: string;
  workbenchHref: string;
  inboxHref: string;
}) {
  const [session, setSession] = useState<ReconSessionListItem | null>(null);
  const [queue, setQueue] = useState<ReconCaseRow[]>([]);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(() => {
      listGuidedQueue(sessionId).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSession(res.session);
        setQueue(res.cases);
        setIdx((i) => Math.min(i, Math.max(0, res.cases.length - 1)));
        setError(null);
      });
    });
  }, [sessionId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const current = queue[idx] ?? null;
  const total = queue.length;

  function afterAction() {
    setInfo(null);
    listGuidedQueue(sessionId).then((res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSession(res.session);
      setQueue(res.cases);
      if (res.cases.length === 0) {
        setIdx(0);
        setInfo('All items handled for now.');
        return;
      }
      setIdx((i) => Math.min(i, res.cases.length - 1));
    });
  }

  function act(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okMsg: string) {
    startTransition(() => {
      fn().then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo(okMsg);
        afterAction();
      });
    });
  }

  if (!session && pending) {
    return (
      <div className="brw-loading">
        <Loader2 className="spin" size={22} />
        Loading guided queue…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="brw-loading">
        {error ?? 'Session not found.'}
        <Link href={inboxHref} className="bis-btn secondary" style={{ marginTop: 12 }}>
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="brg">
      <header className="brg-head">
        <Link href={workbenchHref} className="brw-back">
          ← Full workbench
        </Link>
        <h1 className="brw-title">
          Fix one by one
          <span className="brw-period"> · {session.bankName}</span>
        </h1>
        <p className="brw-sub">{session.periodLabel}</p>
      </header>

      {total === 0 ? (
        <div className="brg-done">
          <CheckCircle2 size={28} className="brw-done-icon" />
          <strong>Nothing left that needs a decision</strong>
          <p>Open the full workbench to review, finish, or export the report.</p>
          <Link href={workbenchHref} className="bis-btn primary">
            Open workbench
          </Link>
        </div>
      ) : current ? (
        <>
          <div className="brg-progress">
            <strong>
              Item {idx + 1} of {total}
            </strong>
            <div className="brw-progress-bar tall" aria-hidden>
              <i style={{ width: `${Math.round(((idx + 1) / total) * 100)}%` }} />
            </div>
          </div>

          <article className="brg-card">
            <span className={`brw-result tone-${tone(current)}`}>
              {current.resultLabel ?? current.userLabel ?? current.caseType}
            </span>
            <p className="brw-explain">{current.explanation ?? '—'}</p>

            <div className="brg-sides">
              <div>
                <span className="brw-case-side-label">Bank</span>
                {current.bank.date ? (
                  <>
                    <div className="brw-cell-date">{formatDate(current.bank.date)}</div>
                    <div className="brw-cell-desc">{current.bank.description}</div>
                    <div className={(current.bank.amount ?? 0) < 0 ? 'brw-amt out' : 'brw-amt in'}>
                      {formatRs(current.bank.amount)}
                    </div>
                  </>
                ) : (
                  <span className="brw-muted">No bank transaction</span>
                )}
              </div>
              <div>
                <span className="brw-case-side-label">BookOne</span>
                {current.book.date ? (
                  <>
                    <div className="brw-cell-date">{formatDate(current.book.date)}</div>
                    <div className="brw-cell-desc">{current.book.description}</div>
                    <div className={(current.book.amount ?? 0) < 0 ? 'brw-amt out' : 'brw-amt in'}>
                      {formatRs(current.book.amount)}
                    </div>
                  </>
                ) : (
                  <span className="brw-muted">No BookOne record</span>
                )}
              </div>
            </div>

            <div className="brg-actions">
              {current.caseType === 'match_1_1' && current.state !== 'confirmed' ? (
                <button
                  type="button"
                  className="bis-btn primary bis-btn-block"
                  disabled={pending}
                  onClick={() =>
                    act(() => confirmCaseMatch({ caseId: current.id }), 'Match confirmed.')
                  }
                >
                  Confirm match
                </button>
              ) : null}
              {current.caseType === 'match_1_1' && current.state === 'confirmed' ? (
                <button
                  type="button"
                  className="bis-btn secondary bis-btn-block"
                  disabled={pending}
                  onClick={() => act(() => undoCaseMatch({ caseId: current.id }), 'Unlinked.')}
                >
                  <Unlink size={14} /> Unlink
                </button>
              ) : null}
              {(current.caseType === 'create_entry' || current.caseType === 'group_match') &&
              current.state !== 'confirmed' ? (
                <button
                  type="button"
                  className="bis-btn primary bis-btn-block"
                  disabled={pending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Add this bank transaction to BookOne? Posts a cashbook entry.',
                      )
                    )
                      return;
                    act(() => createCaseEntry({ caseId: current.id }).then((r) =>
                      r.ok ? { ok: true as const } : r,
                    ), 'Added to BookOne.');
                  }}
                >
                  <Plus size={14} /> Add to BookOne
                </button>
              ) : null}
              {current.caseType === 'transfer' && current.state !== 'confirmed' ? (
                <>
                  <Link
                    href={workbenchHref}
                    className="bis-btn primary bis-btn-block"
                    style={{ textAlign: 'center' }}
                  >
                    <ArrowRightLeft size={14} /> Open workbench for transfer
                  </Link>
                  <button
                    type="button"
                    className="bis-btn secondary bis-btn-block"
                    disabled={pending}
                    onClick={() =>
                      act(
                        () => rejectTransferCase({ caseId: current.id }),
                        'Not a transfer — will appear under Add.',
                      )
                    }
                  >
                    Not a transfer
                  </button>
                </>
              ) : null}
              {current.caseType === 'outstanding_book' && current.state !== 'confirmed' ? (
                <button
                  type="button"
                  className="bis-btn primary bis-btn-block"
                  disabled={pending}
                  onClick={() =>
                    act(
                      () => markCaseOutstanding({ caseId: current.id }),
                      'Marked as waiting to clear.',
                    )
                  }
                >
                  Still waiting to clear
                </button>
              ) : null}
            </div>
          </article>

          <div className="brg-nav">
            <button
              type="button"
              className="bis-btn secondary"
              disabled={pending || idx <= 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              type="button"
              className="bis-btn secondary"
              disabled={pending || idx >= total - 1}
              onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
            >
              Skip <ChevronRight size={14} />
            </button>
          </div>
        </>
      ) : null}

      {error ? <p className="bis-error">{error}</p> : null}
      {info ? <p className="bis-match-info">{info}</p> : null}
    </div>
  );
}

function tone(row: ReconCaseRow): string {
  if (row.caseType === 'transfer') return 'decide';
  if (row.caseType === 'create_entry') return 'add';
  if (row.caseType === 'outstanding_book') return 'wait';
  if (row.caseType === 'match_1_1' && row.confidence === 'strong') return 'ready';
  if (row.caseType === 'match_1_1') return 'decide';
  return 'muted';
}
