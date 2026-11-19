'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
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

const OUT_CATS = [
  { value: '6800', label: '6800 · Bank fees' },
  { value: '6600', label: '6600 · Bank charges' },
  { value: '6200', label: '6200 · Utilities' },
  { value: '6100', label: '6100 · Rent' },
  { value: '6400', label: '6400 · Transport' },
  { value: '6000', label: '6000 · Other cost' },
];
const IN_CATS = [
  { value: '4300', label: '4300 · Other income' },
  { value: '4000', label: '4000 · Sales' },
  { value: '3000', label: '3000 · Own money in' },
];

function money(n: number) {
  const sign = n < 0 ? '−' : '';
  return `${sign}LKR ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function day(iso: string) {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
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
  const [cat, setCat] = useState('6800');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<
    { id: string; date: string; description: string; amountSigned: number }[]
  >([]);
  const [finishOpen, setFinishOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

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

  const selectedBank = useMemo(
    () => openBank.filter((r) => r.bankLineId && bankSel.includes(r.bankLineId)),
    [openBank, bankSel],
  );
  const selectedBook = useMemo(
    () => openBook.filter((r) => r.transactionId && bookSel.includes(r.transactionId)),
    [openBook, bookSel],
  );
  const bankSum = selectedBank.reduce((s, r) => s + r.amount, 0);
  const bookSum = selectedBook.reduce((s, r) => s + r.amount, 0);
  const canMatch = selectedBank.length > 0 && selectedBook.length > 0;
  const amountsOk = canMatch && Math.abs(bankSum - bookSum) <= 0.02;
  const uniquePair =
    selectedBank.length === 1 &&
    selectedBook.length === 1 &&
    Boolean(selectedBank[0]?.pairCaseId) &&
    selectedBank[0]?.pairCaseId === selectedBook[0]?.pairCaseId;
  const finished = board?.session.status === 'reconciled';
  const canFinish = Boolean(board?.review.canFinish) && !finished;
  const review = board?.review;

  const createRow = createCaseId
    ? openBank.find((r) => r.caseId === createCaseId)
    : selectedBank.length === 1 && selectedBank[0]?.status === 'bank_only'
      ? selectedBank[0]
      : null;
  const createIn = (createRow?.amount ?? 0) > 0;

  useEffect(() => {
    if (!createRow) return;
    setCat(createRow.amount > 0 ? '4300' : '6800');
  }, [createRow]);

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
      pushStatusToast({ kind: 'error', message: 'Search BookOne first, then create if the line is missing.' });
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
      pushStatusToast({ kind: 'error', message: 'Select one BookOne line that is not on the statement.' });
      return;
    }
    run(() => markCaseOutstanding({ caseId: selectedBook[0]!.caseId }), 'Marked waiting to clear');
  }

  function doSearch() {
    const target = createRow?.amount ?? selectedBank[0]?.amount;
    start(() => {
      searchBookForSession({
        sessionId,
        q: searchQ,
        targetAmount: target,
      }).then((res) => {
        if (!res.ok) {
          pushStatusToast({ kind: 'error', message: res.error });
          return;
        }
        setSearchHits(res.candidates);
        setSearchOpen(true);
      });
    });
  }

  const bankToReview = openBank.filter((r) => r.status === 'bank_only' || r.status === 'needs_decision').length;

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
        <Link href={inboxHref} className="brc-back" style={{ display: 'block', marginTop: 12 }}>
          ← Imports
        </Link>
      </div>
    );
  }

  return (
    <div className="brc">
      <header className="brc-head">
        <Link href={inboxHref} className="brc-back">
          ← Imports
        </Link>
        <div className="brc-head-main">
          <h1>
            {board.session.bankName}
            <span>{board.session.periodLabel}</span>
          </h1>
          <p>
            Bank statement on the left, BookOne on the right. Confirm a suggested match to link two existing
            records — that does not create a journal.
          </p>
        </div>
        <div className="brc-head-actions">
          {board.obviousCount > 0 && !finished ? (
            <Button
              variant="secondary"
              type="button"
              disabled={pending}
              onClick={() => run(() => bulkConfirmStrongMatches(sessionId), 'Confirmed obvious matches')}
            >
              Match obvious ({board.obviousCount})
            </Button>
          ) : null}
          {finished ? (
            <Button
              variant="secondary"
              type="button"
              disabled={pending}
              onClick={() => run(() => reopenReconciliationSession(sessionId), 'Reopened')}
            >
              Reopen
            </Button>
          ) : canFinish ? (
            <Button
              variant="primary"
              type="button"
              disabled={pending}
              data-testid="brc-review-finish"
              onClick={() => setFinishOpen(true)}
            >
              Review & finish
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="brc-stats" data-testid="brc-summary">
        <div>
          <span>Account</span>
          <strong>
            {board.session.bankCode} · {board.session.bankName}
          </strong>
        </div>
        <div>
          <span>Period</span>
          <strong>{board.session.periodLabel}</strong>
        </div>
        <div>
          <span>Bank closing</span>
          <strong>{review?.bankClosing != null ? money(review.bankClosing) : '—'}</strong>
        </div>
        <div>
          <span>BookOne closing</span>
          <strong>{review?.bookClosing != null ? money(review.bookClosing) : '—'}</strong>
        </div>
        <div>
          <span>Explained timing</span>
          <strong>{money(review?.outstandingNet ?? 0)}</strong>
        </div>
        <div>
          <span>Difference</span>
          <strong>{money(review?.difference ?? 0)}</strong>
        </div>
      </div>
      <p className="brc-explain">
        BookOne {money(review?.bookClosing ?? 0)} − waiting items {money(review?.outstandingNet ?? 0)} should equal
        bank {money(review?.bankClosing ?? 0)}. Remaining difference {money(review?.difference ?? 0)}.
      </p>
      {bankToReview > 0 ? (
        <p className="muted-line">{bankToReview} bank line{bankToReview === 1 ? '' : 's'} to review</p>
      ) : null}

      <div className="brc-board">
        <section className="brc-pane" data-testid="brc-bank-pane">
          <header>
            <h2>Bank statement</h2>
            <small>Imported lines for this period</small>
          </header>
          <div className="brc-list">
            {bankRows.length === 0 ? (
              <p className="brc-empty">Nothing left on this side.</p>
            ) : (
              bankRows.map((row) => (
                <CompareRow
                  key={`bank-${row.caseId}-${row.bankLineId}`}
                  row={row}
                  side="bank"
                  selected={Boolean(row.bankLineId && bankSel.includes(row.bankLineId))}
                  pairOn={Boolean(row.pairCaseId && selectedBook.some((b) => b.pairCaseId === row.pairCaseId))}
                  disabled={finished || pending || !row.selectable}
                  onToggle={() => {
                    if (!row.bankLineId || !row.selectable) return;
                    toggle(bankSel, row.bankLineId, setBankSel);
                    setCreateCaseId(row.status === 'bank_only' ? row.caseId : null);
                    if (row.status === 'bank_only') setSearchOpen(true);
                  }}
                />
              ))
            )}
          </div>
        </section>
        <section className="brc-pane" data-testid="brc-book-pane">
          <header>
            <h2>BookOne records</h2>
            <small>Entries already in the books</small>
          </header>
          <div className="brc-list">
            {bookRows.length === 0 ? (
              <p className="brc-empty">Nothing left on this side.</p>
            ) : (
              bookRows.map((row) => (
                <CompareRow
                  key={`book-${row.caseId}-${row.transactionId}`}
                  row={row}
                  side="book"
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

      {!finished ? (
        <div className="brc-bar">
          <div className="brc-bar-sums">
            {selectedBank.length > 0 ? <span>Bank {money(bankSum)}</span> : null}
            {selectedBook.length > 0 ? <span>BookOne {money(bookSum)}</span> : null}
            {uniquePair ? (
              <span>Matching links two existing records. No journal is created.</span>
            ) : canMatch && !amountsOk ? (
              <span className="brc-warn">Amounts don’t match — pick different lines, or several that add up.</span>
            ) : null}
          </div>
          <div className="brc-bar-actions">
            <Button
              variant="primary"
              type="button"
              data-testid="brc-confirm-match"
              disabled={pending || !canMatch || !amountsOk}
              onClick={confirmMatch}
            >
              Confirm match
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={pending || selectedBook.length !== 1 || selectedBook[0]?.status === 'possible_match'}
              onClick={waiting}
            >
              Waiting to clear
            </Button>
            {createRow ? (
              <>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={pending}
                  onClick={doSearch}
                >
                  Search BookOne
                </Button>
                <SelectField
                  id="brc-create-cat"
                  label="Category"
                  value={cat}
                  onChange={setCat}
                  options={createIn ? IN_CATS : OUT_CATS}
                  searchable={false}
                />
                <Button variant="secondary" type="button" disabled={pending} onClick={() => setCreateOpen(true)}>
                  Create in BookOne
                </Button>
              </>
            ) : (
              <span className="muted-line">Select a bank-only line to search BookOne first.</span>
            )}
          </div>
        </div>
      ) : (
        <p className="muted-line" style={{ padding: '8px 4px' }}>
          This month is finished. Reopen if you need to change a match.
        </p>
      )}

      {searchOpen ? (
        <div className="brc-search" data-testid="brc-search">
          <TextField
            id="brc-search-q"
            label="Search BookOne"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Amount, date, reference or description"
          />
          <Button variant="secondary" type="button" disabled={pending} onClick={doSearch}>
            Search
          </Button>
          <ul>
            {searchHits.length === 0 ? (
              <li className="muted-line">No BookOne rows yet. Create the bank line if it is missing.</li>
            ) : (
              searchHits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    className="brc-search-hit"
                    onClick={() => {
                      if (!hit.id) return;
                      setBookSel([hit.id]);
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

      {review?.finishBlockers && review.finishBlockers.length > 0 && !finished ? (
        <p className="muted-line">Before finish: {review.finishBlockers.join(' · ')}</p>
      ) : null}

      <p className="brc-classic">
        <Link href={classicHref}>Classic workbench</Link>
        {pending ? ' · Working…' : ''}
      </p>

      <ConfirmDialog
        open={createOpen}
        title="Create this BookOne entry?"
        message={
          createRow
            ? `Post ${money(createRow.amount)} as ${createIn ? 'income' : 'expense'} ${cat}. This creates a journal.`
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
          <p>
            {board.session.bankCode} · {board.session.bankName}
            <br />
            {board.session.periodLabel}
          </p>
          <ul>
            <li>Bank closing {money(review?.bankClosing ?? 0)}</li>
            <li>BookOne closing {money(review?.bookClosing ?? 0)}</li>
            <li>Waiting to clear {money(review?.outstandingNet ?? 0)}</li>
            <li>Difference {money(review?.difference ?? 0)}</li>
            <li>Matched {review?.matched ?? 0}</li>
            <li>Added {review?.added ?? 0}</li>
          </ul>
          {review?.finishBlockers && review.finishBlockers.length > 0 ? (
            <p className="form-error">{review.finishBlockers.join(' · ')}</p>
          ) : (
            <p>Difference is explained. Finishing does not lock the accounting period.</p>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}

function CompareRow({
  row,
  side,
  selected,
  pairOn,
  disabled,
  onToggle,
}: {
  row: CompareSideRow;
  side: 'bank' | 'book';
  selected: boolean;
  pairOn: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`brc-row${selected ? ' is-on' : ''}${row.status === 'possible_match' ? ' is-hint' : ''}${pairOn ? ' is-pair' : ''}${!row.selectable ? ' is-done' : ''}`}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="brc-row-date">{day(row.date)}</span>
      <span className="brc-row-body">
        <strong>{row.description}</strong>
        <small>
          <span className={`brc-badge brc-badge-${row.status}`}>{statusLabel(row.status)}</span>
          {row.reference ? <span className="brc-ref">{row.reference}</span> : null}
          {row.hint ? ` · ${row.hint}` : ''}
        </small>
      </span>
      <span className={`brc-row-amt${row.amount < 0 ? ' is-out' : ' is-in'}`}>{money(row.amount)}</span>
      <span className="brc-row-side">{side === 'bank' ? 'Bank' : 'BookOne'}</span>
    </button>
  );
}
