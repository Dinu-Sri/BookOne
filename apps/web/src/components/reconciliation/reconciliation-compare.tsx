'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { ArrowLeft, Check, CircleAlert } from 'lucide-react';
import {
  bulkConfirmStrongMatches,
  confirmCaseMatch,
  createCaseEntry,
  finishReconciliationSession,
  getCompareBoard,
  markCaseOutstanding,
  matchBankToBook,
  reopenReconciliationSession,
  searchBookForSession,
  type CompareBoard,
  type CompareRowStatus,
  type CompareSideRow,
} from '@/app/actions/bank-reconciliation';
import { pushStatusToast } from '@/components/layout/status-toast';
import { Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { withFormPending } from '@/components/ui/form-busy';

function catLabel(account: { code: string; name: string }) {
  return `${account.code} · ${account.name}`;
}

function catOptions(accounts: { code: string; name: string }[]) {
  return accounts.map((a) => ({ value: a.code, label: catLabel(a) }));
}

function money(n: number) {
  const sign = n < 0 ? '−' : '';
  return `${sign}LKR ${Math.abs(n).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function day(iso: string) {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}

function statusLabel(status: CompareRowStatus) {
  switch (status) {
    case 'possible_match':
      return 'Possible match';
    case 'bank_only':
      return 'Bank only';
    case 'book_only':
      return 'BookOne only';
    case 'waiting':
      return 'Waiting to clear';
    case 'matched':
      return 'Matched';
    default:
      return 'Needs decision';
  }
}

type Filter = 'todo' | 'done' | 'all';

function isTodo(r: CompareSideRow) {
  return r.selectable;
}

/**
 * Reconcile one bank account for one period. Full-height workspace:
 * balance line → to-do filter → bank and BookOne lists → action bar for
 * whatever is selected. Nothing is recorded until the user confirms.
 */
export function ReconciliationCompare({
  sessionId,
  inboxHref,
  classicHref,
}: {
  sessionId: string;
  inboxHref: string;
  classicHref: string;
}) {
  const [board, setBoard] = useState<CompareBoard | null>(null);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const [ready, setReady] = useState(false);
  const [bankSel, setBankSel] = useState<string[]>([]);
  const [bookSel, setBookSel] = useState<string[]>([]);
  const [createCaseId, setCreateCaseId] = useState<string | null>(null);
  const [cat, setCat] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<{ id: string; date: string; description: string; amountSigned: number }[]>([]);
  const [finishOpen, setFinishOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('todo');

  const load = useCallback(() => {
    start(() => {
      getCompareBoard(sessionId).then((res) => {
        setReady(true);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setBoard(res.board);
        setError('');
        setBankSel([]);
        setBookSel([]);
        setCreateCaseId(null);
        setSearchOpen(false);
        setSearchHits([]);
      });
    });
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const bankRows = board?.bank ?? [];
  const bookRows = board?.book ?? [];
  const openBank = bankRows.filter((r) => r.selectable);
  const openBook = bookRows.filter((r) => r.selectable);
  const finished = board?.session.status === 'reconciled';

  // A finished month opens on everything; otherwise only what still needs you.
  useEffect(() => {
    if (finished) setFilter('all');
  }, [finished]);

  useEffect(() => {
    if (!board) return;
    if (bankSel.length > 0 || bookSel.length > 0) return;
    const first = openBank.find((r) => r.status === 'possible_match');
    if (!first?.bankLineId) return;
    const pair = openBook.find((r) => r.pairCaseId && r.pairCaseId === first.pairCaseId);
    setBankSel([first.bankLineId]);
    if (pair?.transactionId) setBookSel([pair.transactionId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  const selectedBank = useMemo(() => openBank.filter((r) => r.bankLineId && bankSel.includes(r.bankLineId)), [openBank, bankSel]);
  const selectedBook = useMemo(() => openBook.filter((r) => r.transactionId && bookSel.includes(r.transactionId)), [openBook, bookSel]);
  const bankSum = selectedBank.reduce((s, r) => s + r.amount, 0);
  const bookSum = selectedBook.reduce((s, r) => s + r.amount, 0);
  const canMatch = selectedBank.length > 0 && selectedBook.length > 0;
  const amountsOk = canMatch && Math.abs(bankSum - bookSum) <= 0.02;
  const uniquePair =
    selectedBank.length === 1 &&
    selectedBook.length === 1 &&
    Boolean(selectedBank[0]?.pairCaseId) &&
    selectedBank[0]?.pairCaseId === selectedBook[0]?.pairCaseId;
  const canFinish = Boolean(board?.review.canFinish) && !finished;
  const review = board?.review;

  const createRow = createCaseId
    ? openBank.find((r) => r.caseId === createCaseId)
    : selectedBank.length === 1 && selectedBank[0]?.status === 'bank_only'
      ? selectedBank[0]
      : null;
  const createIn = (createRow?.amount ?? 0) > 0;
  const postingList = createIn ? (board?.posting?.income ?? []) : (board?.posting?.expenses ?? []);
  const selectedCat = postingList.find((a) => a.code === cat);

  useEffect(() => {
    if (!createRow) return;
    const list = createRow.amount > 0 ? (board?.posting?.income ?? []) : (board?.posting?.expenses ?? []);
    // BookOne's suggestion for this line (e.g. Bank Charges for "SERVICE CHARGES"), else Other income / General expense.
    const preferred = createRow.suggestedCategory ?? (createRow.amount > 0 ? '4300' : '6800');
    setCat(list.some((a) => a.code === preferred) ? preferred : (list[0]?.code ?? ''));
  }, [createRow, board]);

  function toggle(list: string[], id: string, set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string; confirmed?: number }>, okMsg: string) {
    start(() => {
      void withFormPending(async () => {
        const res = await fn();
        if (!res.ok) {
          pushStatusToast({ kind: 'error', message: res.error ?? 'Could not save.' });
          return;
        }
        const extra = res.confirmed != null ? ` (${res.confirmed})` : '';
        pushStatusToast({ kind: 'success', message: `${okMsg}${extra}` });
        load();
      });
    });
  }

  function confirmMatch() {
    if (uniquePair && selectedBank[0]) {
      run(() => confirmCaseMatch({ caseId: selectedBank[0]!.caseId }), 'Match confirmed');
      return;
    }
    if (!canMatch || !amountsOk) return;
    run(
      () =>
        matchBankToBook({
          sessionId,
          bankLineIds: selectedBank.map((r) => r.bankLineId!),
          transactionIds: selectedBook.map((r) => r.transactionId!),
        }),
      'Matched',
    );
  }

  function addToBooks() {
    if (!createRow) {
      pushStatusToast({ kind: 'error', message: 'Pick the bank line that is missing from BookOne first.' });
      return;
    }
    const isIn = createRow.amount > 0;
    run(
      () =>
        createCaseEntry({
          caseId: createRow.caseId,
          expenseCode: isIn ? undefined : cat,
          incomeCode: isIn ? cat : undefined,
        }),
      'Added to BookOne',
    );
    setCreateOpen(false);
  }

  function waiting() {
    if (selectedBook.length !== 1) {
      pushStatusToast({ kind: 'error', message: 'Pick one BookOne entry that is not on the statement.' });
      return;
    }
    run(() => markCaseOutstanding({ caseId: selectedBook[0]!.caseId }), 'Marked waiting to clear');
  }

  function doSearch() {
    const target = createRow?.amount ?? selectedBank[0]?.amount;
    start(() => {
      searchBookForSession({ sessionId, q: searchQ, targetAmount: target }).then((res) => {
        if (!res.ok) {
          pushStatusToast({ kind: 'error', message: res.error });
          return;
        }
        setSearchHits(res.candidates);
        setSearchOpen(true);
      });
    });
  }

  function clearSelection() {
    setBankSel([]);
    setBookSel([]);
    setCreateCaseId(null);
    setSearchOpen(false);
  }

  if (!ready && pending) {
    return (
      <div className="brc-loading" role="status">
        Loading this reconciliation…
      </div>
    );
  }

  if (!board) {
    return (
      <div className="brc-loading">
        {error || 'This reconciliation is still opening.'}
        <Link href={inboxHref} className="brc-back" style={{ display: 'inline-flex', marginTop: 12 }}>
          <ArrowLeft size={14} aria-hidden /> Bank reconciliation
        </Link>
      </div>
    );
  }

  const total = bankRows.length + bookRows.length;
  const todoCount = openBank.length + openBook.length;
  const doneCount = total - todoCount;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const left = review?.differenceVerified ? review.difference : null;
  const balanced = left != null && Math.abs(left) < 0.005;
  const visible = (rows: CompareSideRow[]) =>
    filter === 'all' ? rows : filter === 'todo' ? rows.filter(isTodo) : rows.filter((r) => !isTodo(r));
  const bankShown = visible(bankRows);
  const bookShown = visible(bookRows);
  const hint = selectedBank[0]?.hint ?? selectedBook[0]?.hint ?? null;

  return (
    <div className="brc brc-v2">
      <header className="brc-head">
        <Link href={inboxHref} className="brc-back" aria-label="Back to bank reconciliation">
          <ArrowLeft size={16} aria-hidden />
        </Link>
        <div className="brc-head-main">
          <h1>
            {board.session.bankName}
            <span>{board.session.periodLabel}</span>
          </h1>
          <p>
            {finished
              ? 'This month is reconciled.'
              : 'Match each bank line to BookOne. Add what the bank did that you did not record, and mark late items as waiting.'}
          </p>
        </div>
        <div className="brc-head-actions">
          <Link href={classicHref} className="brc-detail-link">
            Detailed view
          </Link>
          {board.obviousCount > 0 && !finished ? (
            <Button
              variant="secondary"
              type="button"
              disabled={pending}
              onClick={() => run(() => bulkConfirmStrongMatches(sessionId), 'Confirmed obvious matches')}
            >
              Confirm sure matches ({board.obviousCount})
            </Button>
          ) : null}
          {finished ? (
            <Button variant="secondary" type="button" disabled={pending} onClick={() => run(() => reopenReconciliationSession(sessionId), 'Reopened')}>
              Reopen
            </Button>
          ) : canFinish ? (
            <Button variant="primary" type="button" disabled={pending} data-testid="brc-review-finish" onClick={() => setFinishOpen(true)}>
              Review & finish
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className={`brc-balance${balanced ? ' is-ok' : ' is-open'}`} data-testid="brc-summary" aria-label="Balance check">
        <dl className="brc-balance-terms">
          <div>
            <dt>Bank closing</dt>
            <dd>{review?.bankClosing != null ? money(review.bankClosing) : '—'}</dd>
          </div>
          <div>
            <dt>BookOne balance</dt>
            <dd>{review?.bookClosing != null ? money(review.bookClosing) : '—'}</dd>
          </div>
          <div>
            <dt>Waiting to clear</dt>
            <dd>{money(review?.outstandingNet ?? 0)}</dd>
          </div>
        </dl>
        <div className="brc-balance-result">
          <span className="brc-balance-icon" aria-hidden>
            {balanced ? <Check size={18} /> : <CircleAlert size={18} />}
          </span>
          <div>
            <span className="brc-balance-label">Left to explain</span>
            <strong data-testid="brc-difference">{review?.differenceVerified ? money(review.difference) : 'Unverified'}</strong>
          </div>
        </div>
        <p className="brc-explain">
          BookOne balance minus items waiting to clear should equal the bank closing balance.
          {balanced ? ' They agree.' : ''}
        </p>
      </section>

      <div className="brc-toolbar">
        <div className="brc-tabs" role="tablist" aria-label="Show">
          {(
            [
              ['todo', `To do ${todoCount}`],
              ['done', `Done ${doneCount}`],
              ['all', `All ${total}`],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? 'is-on' : ''} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="brc-progress" aria-label={`${doneCount} of ${total} done`}>
          <span className="brc-progress-bar" aria-hidden>
            <i style={{ width: `${pct}%` }} />
          </span>
          <span>
            {doneCount} of {total} done
          </span>
        </div>
      </div>

      <div className="brc-board">
        <section className="brc-pane" data-testid="brc-bank-pane">
          <header>
            <h2>Bank statement</h2>
            <small>{bankShown.length} line{bankShown.length === 1 ? '' : 's'}</small>
          </header>
          <div className="brc-list">
            {bankShown.length === 0 ? (
              <p className="brc-empty">{filter === 'todo' ? 'Every bank line is done.' : 'Nothing here.'}</p>
            ) : (
              bankShown.map((row) => (
                <CompareRow
                  key={`bank-${row.caseId}-${row.bankLineId}`}
                  row={row}
                  selected={Boolean(row.bankLineId && bankSel.includes(row.bankLineId))}
                  pairOn={Boolean(row.pairCaseId && selectedBook.some((b) => b.pairCaseId === row.pairCaseId))}
                  disabled={finished || pending || !row.selectable}
                  onToggle={() => {
                    if (!row.bankLineId || !row.selectable) return;
                    toggle(bankSel, row.bankLineId, setBankSel);
                    setCreateCaseId(row.status === 'bank_only' ? row.caseId : null);
                    if (row.status !== 'bank_only') setSearchOpen(false);
                  }}
                />
              ))
            )}
          </div>
        </section>
        <section className="brc-pane" data-testid="brc-book-pane">
          <header>
            <h2>BookOne records</h2>
            <small>{bookShown.length} entr{bookShown.length === 1 ? 'y' : 'ies'}</small>
          </header>
          <div className="brc-list">
            {bookShown.length === 0 ? (
              <p className="brc-empty">{filter === 'todo' ? 'Every BookOne entry is done.' : 'Nothing here.'}</p>
            ) : (
              bookShown.map((row) => (
                <CompareRow
                  key={`book-${row.caseId}-${row.transactionId}`}
                  row={row}
                  selected={Boolean(row.transactionId && bookSel.includes(row.transactionId))}
                  pairOn={Boolean(row.pairCaseId && selectedBank.some((b) => b.pairCaseId === row.pairCaseId))}
                  disabled={finished || pending || !row.selectable}
                  onToggle={() => row.transactionId && row.selectable && toggle(bookSel, row.transactionId, setBookSel)}
                />
              ))
            )}
          </div>
        </section>
      </div>

      {finished ? (
        <footer className="brc-dock is-done">
          <p className="brc-dock-text">
            <strong>Reconciled.</strong> Reopen only if you need to change a match.
          </p>
          <div className="brc-dock-actions">
            <Link className="button secondary" href={classicHref.replace('?view=classic', '/report')}>
              Report
            </Link>
          </div>
        </footer>
      ) : (
        <footer className="brc-dock" aria-live="polite">
          <div className="brc-dock-text">
            {canMatch ? (
              <>
                <strong>
                  Bank {money(bankSum)} and BookOne {money(bookSum)}
                </strong>
                <span className={amountsOk ? '' : 'brc-warn'}>
                  {uniquePair
                    ? hint || 'These look like the same payment.'
                    : amountsOk
                      ? 'The amounts agree. Confirm to link them; nothing new is recorded.'
                      : 'The amounts do not agree. Pick other lines, or several that add up.'}
                </span>
              </>
            ) : createRow ? (
              <>
                <strong>
                  {day(createRow.date)} · {createRow.description} · {money(createRow.amount)}
                </strong>
                <span>Not in BookOne yet. Check it is not recorded differently, then add it with the right category.</span>
              </>
            ) : selectedBook.length === 1 ? (
              <>
                <strong>
                  {day(selectedBook[0]!.date)} · {selectedBook[0]!.description} · {money(selectedBook[0]!.amount)}
                </strong>
                <span>On your books but not on this statement. If the bank will show it next month, mark it waiting to clear.</span>
              </>
            ) : selectedBank.length > 0 || selectedBook.length > 0 ? (
              <span>Pick a line on the other side with the same amount to match them.</span>
            ) : todoCount === 0 ? (
              <strong>Everything is done. Review and finish the month.</strong>
            ) : (
              <span>Pick a line to see what to do with it.</span>
            )}
          </div>
          <div className="brc-dock-actions">
            {createRow ? (
              <>
                <Button variant="secondary" type="button" disabled={pending} onClick={doSearch}>
                  Search BookOne
                </Button>
                <div className="brc-dock-cat">
                  <SelectField
                    id="brc-create-cat"
                    label="Category"
                    value={cat}
                    onChange={setCat}
                    options={catOptions(postingList)}
                    searchable={postingList.length >= 8}
                    emptyReason="No eligible posting account on this company chart."
                  />
                </div>
                <Button variant="primary" type="button" disabled={pending || !cat} onClick={() => setCreateOpen(true)}>
                  Create in BookOne
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={pending || selectedBook.length !== 1 || selectedBank.length > 0 || selectedBook[0]?.status === 'possible_match'}
                  onClick={waiting}
                >
                  Waiting to clear
                </Button>
                <Button variant="primary" type="button" data-testid="brc-confirm-match" disabled={pending || !canMatch || !amountsOk} onClick={confirmMatch}>
                  Confirm match
                </Button>
              </>
            )}
            {selectedBank.length + selectedBook.length > 0 ? (
              <Button variant="ghost" type="button" disabled={pending} onClick={clearSelection}>
                Clear
              </Button>
            ) : null}
          </div>
          {searchOpen && createRow ? (
            <div className="brc-search" data-testid="brc-search">
              <div className="brc-search-bar">
                <TextField
                  id="brc-search-q"
                  label="Search BookOne"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Amount, date or description"
                />
                <Button variant="secondary" type="button" disabled={pending} onClick={doSearch}>
                  Search
                </Button>
              </div>
              <ul>
                {searchHits.length === 0 ? (
                  <li className="muted-line">Nothing similar in BookOne. Add it with the button above.</li>
                ) : (
                  searchHits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        className={`brc-search-hit${bookSel.includes(hit.id) ? ' is-on' : ''}`}
                        onClick={() => {
                          if (!hit.id) return;
                          setBookSel([hit.id]);
                          setCreateCaseId(null);
                        }}
                      >
                        <span>{day(hit.date)}</span>
                        <strong>{hit.description}</strong>
                        <span className="brc-row-amt">{money(hit.amountSigned)}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null}
        </footer>
      )}


      <ConfirmDialog
        open={createOpen}
        title="Create this BookOne entry?"
        message={
          createRow
            ? `Add ${money(Math.abs(createRow.amount))} ${createIn ? 'money in' : 'money out'} to BookOne as ${selectedCat ? catLabel(selectedCat) : cat}, dated like the bank line. It is recorded in your books.`
            : 'Create a BookOne entry for the selected bank line?'
        }
        confirmLabel="Create entry"
        tone="primary"
        busy={pending}
        onCancel={() => setCreateOpen(false)}
        onConfirm={addToBooks}
      />

      <ConfirmDialog
        open={finishOpen}
        title="Review & finish"
        confirmLabel="Finish reconciliation"
        tone="primary"
        busy={pending}
        onCancel={() => setFinishOpen(false)}
        onConfirm={() => {
          setFinishOpen(false);
          run(() => finishReconciliationSession(sessionId), 'Finished');
        }}
      >
        <div className="brc-finish-review" data-testid="brc-finish-review">
          <p className="brc-finish-title">
            {board.session.bankCode} · {board.session.bankName} · {board.session.periodLabel}
          </p>
          <dl className="brc-finish-sum">
            <div>
              <dt>Bank closing </dt>
              <dd>{money(review?.bankClosing ?? 0)}</dd>
            </div>
            <div>
              <dt>BookOne closing </dt>
              <dd>{money(review?.bookClosing ?? 0)}</dd>
            </div>
            <div>
              <dt>Waiting to clear </dt>
              <dd>{money(review?.outstandingNet ?? 0)}</dd>
            </div>
            <div className="is-total">
              <dt>Difference </dt>
              <dd>{review?.differenceVerified ? money(review.difference) : 'Unverified'}</dd>
            </div>
          </dl>
          <p className="brc-finish-counts">
            Matched {review?.matched ?? 0} · Added {review?.added ?? 0}
          </p>
          {review?.finishBlockers && review.finishBlockers.length > 0 ? (
            <p className="form-error">{review.finishBlockers.join(' · ')}</p>
          ) : (
            <p className="field-help">Difference is explained. Finishing does not lock the accounting period.</p>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}

function CompareRow({
  row,
  selected,
  pairOn,
  disabled,
  onToggle,
}: {
  row: CompareSideRow;
  selected: boolean;
  pairOn: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`brc-row${selected ? ' is-on' : ''}${pairOn ? ' is-pair' : ''}${!row.selectable ? ' is-done' : ''}`}
      disabled={disabled}
      aria-pressed={selected}
      title={row.hint ?? undefined}
      onClick={onToggle}
    >
      <span className="brc-row-date">{day(row.date)}</span>
      <span className="brc-row-desc">{row.description}</span>
      <span className={`brc-badge brc-badge-${row.status}`}>{statusLabel(row.status)}</span>
      <span className={`brc-row-amt${row.amount < 0 ? ' is-out' : ' is-in'}`}>{money(row.amount)}</span>
    </button>
  );
}
