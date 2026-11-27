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
  listReconPostingAccounts,
  markCaseOutstanding,
  matchBankToBook,
  rejectTransferCase,
  searchBookForSession,
  undoCaseMatch,
  type ReconCaseRow,
  type ReconPostingAccount,
  type ReconSessionListItem,
} from '@/app/actions/bank-reconciliation';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { pushStatusToast } from '@/components/layout/status-toast';

function catLabel(account: { code: string; name: string }) {
  return `${account.code} · ${account.name}`;
}

function formatRs(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '-';
  const sign = n < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(n).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '-';
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
  const [createConfirmId, setCreateConfirmId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<
    { id: string; date: string; description: string; amountSigned: number }[]
  >([]);
  const [pickedBookId, setPickedBookId] = useState<string | null>(null);
  const [cat, setCat] = useState('');
  const [expenses, setExpenses] = useState<ReconPostingAccount[]>([]);
  const [income, setIncome] = useState<ReconPostingAccount[]>([]);

  const reload = useCallback(() => {
    startTransition(() => {
      Promise.all([listGuidedQueue(sessionId), listReconPostingAccounts()]).then(([res, posting]) => {
        setReady(true);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSession(res.session);
        setQueue(res.cases);
        setIdx((i) => Math.min(i, Math.max(0, res.cases.length - 1)));
        setError(null);
        setSearchOpen(false);
        setSearchHits([]);
        setPickedBookId(null);
        if (posting.ok) {
          setExpenses(posting.expenses);
          setIncome(posting.income);
        }
      });
    });
  }, [sessionId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const current = queue[idx] ?? null;
  const total = queue.length;
  const createIn = (current?.bank.amount ?? 0) > 0;
  const postingList = createIn ? income : expenses;
  const selectedCat = postingList.find((a) => a.code === cat);

  useEffect(() => {
    if (!current || (current.caseType !== 'create_entry' && current.caseType !== 'group_match')) return;
    const list = (current.bank.amount ?? 0) > 0 ? income : expenses;
    const preferred = (current.bank.amount ?? 0) > 0 ? '4300' : '6800';
    setCat(list.some((a) => a.code === preferred) ? preferred : (list[0]?.code ?? ''));
    setSearchOpen(false);
    setSearchHits([]);
    setPickedBookId(null);
  }, [current, expenses, income]);

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
          pushStatusToast({ kind: 'error', message: res.error });
          return;
        }
        setInfo(okMsg);
        pushStatusToast({ kind: 'success', message: okMsg });
        afterAction();
      });
    });
  }

  if (!ready || (!session && pending)) {
    return (
      <div className="brw-loading" role="status">
        <Loader2 className="spin" size={22} />
        Loading guided queue...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="brw-loading">
        {error ?? 'This reconciliation is still opening.'}
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
            <p className="brw-explain">{current.explanation ?? '-'}</p>

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
                <>
                  <button
                    type="button"
                    className="bis-btn primary bis-btn-block"
                    disabled={pending}
                    onClick={() => {
                      startTransition(() => {
                        searchBookForSession({
                          sessionId,
                          q: searchQ,
                          targetAmount: current.bank.amount ?? undefined,
                        }).then((res) => {
                          if (!res.ok) {
                            pushStatusToast({ kind: 'error', message: res.error });
                            return;
                          }
                          setSearchHits(res.candidates);
                          setSearchOpen(true);
                        });
                      });
                    }}
                  >
                    Search BookOne
                  </button>
                  {searchOpen ? (
                    <div className="brc-search" data-testid="brg-search">
                      <TextField
                        id="brg-search-q"
                        label="Search BookOne"
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                        placeholder="Amount, date, reference or description"
                      />
                      <ul>
                        {searchHits.length === 0 ? (
                          <li className="muted-line">No BookOne rows yet. Create the bank line if it is missing.</li>
                        ) : (
                          searchHits.map((hit) => (
                            <li key={hit.id}>
                              <button
                                type="button"
                                className={`brc-search-hit${pickedBookId === hit.id ? ' is-on' : ''}`}
                                onClick={() => setPickedBookId(hit.id)}
                              >
                                <span>{formatDate(hit.date)}</span>
                                <strong>{hit.description}</strong>
                                <span>{formatRs(hit.amountSigned)}</span>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  ) : (
                    <p className="muted-line">Search BookOne first, then create if the line is missing.</p>
                  )}
                  {pickedBookId && current.bank.lineId ? (
                    <button
                      type="button"
                      className="bis-btn secondary bis-btn-block"
                      disabled={pending}
                      onClick={() =>
                        act(
                          () =>
                            matchBankToBook({
                              sessionId,
                              bankLineIds: [current.bank.lineId!],
                              transactionIds: [pickedBookId],
                            }),
                          'Match confirmed.',
                        )
                      }
                    >
                      Confirm match
                    </button>
                  ) : null}
                  <SelectField
                    id="brg-create-cat"
                    label="Category"
                    value={cat}
                    onChange={setCat}
                    options={postingList.map((a) => ({ value: a.code, label: catLabel(a) }))}
                    searchable={postingList.length >= 8}
                    emptyReason="No eligible posting account on this company chart."
                  />
                  <button
                    type="button"
                    className="bis-btn secondary bis-btn-block"
                    disabled={pending || !cat}
                    onClick={() => setCreateConfirmId(current.id)}
                  >
                    <Plus size={14} /> Create in BookOne
                  </button>
                </>
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
                        'Not a transfer - will appear under Add.',
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

      <ConfirmDialog
        open={!!createConfirmId}
        title="Create this BookOne entry?"
        message={
          current
            ? `Add ${formatRs(Math.abs(current.bank.amount ?? 0))} ${createIn ? 'money in' : 'money out'} to BookOne as ${selectedCat ? catLabel(selectedCat) : cat}, dated like the bank line. It is recorded in your books.`
            : 'Create a BookOne entry for this bank line?'
        }
        confirmLabel="Create entry"
        tone="primary"
        busy={pending}
        onCancel={() => setCreateConfirmId(null)}
        onConfirm={() => {
          const id = createConfirmId;
          setCreateConfirmId(null);
          if (!id) return;
          const isIn = (current?.bank.amount ?? 0) > 0;
          act(
            () =>
              createCaseEntry({
                caseId: id,
                expenseCode: isIn ? undefined : cat,
                incomeCode: isIn ? cat : undefined,
              }).then((r) => (r.ok ? { ok: true as const } : r)),
            'Added to BookOne.',
          );
        }}
      />
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
