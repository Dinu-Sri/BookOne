'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  bulkConfirmStrongMatches,
  createCaseEntry,
  finishReconciliationSession,
  getCompareBoard,
  markCaseOutstanding,
  matchBankToBook,
  reopenReconciliationSession,
  type CompareBoard,
  type CompareSideRow,
} from '@/app/actions/bank-reconciliation';
import { pushStatusToast } from '@/components/layout/status-toast';
import { Button } from '@/components/ui/bookone-ui';

const OUT_CATS = [
  { code: '6600', label: 'Bank fees' },
  { code: '6200', label: 'Utilities' },
  { code: '6100', label: 'Rent' },
  { code: '6400', label: 'Transport' },
  { code: '6000', label: 'Other cost' },
];
const IN_CATS = [
  { code: '4000', label: 'Sales' },
  { code: '4300', label: 'Other income' },
  { code: '3000', label: 'Own money in' },
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
  const [bankSel, setBankSel] = useState<string[]>([]);
  const [bookSel, setBookSel] = useState<string[]>([]);
  const [createCaseId, setCreateCaseId] = useState<string | null>(null);
  const [cat, setCat] = useState('6000');

  const load = useCallback(() => {
    start(() => {
      getCompareBoard(sessionId).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setBoard(res.board);
        setError('');
        setBankSel([]);
        setBookSel([]);
        setCreateCaseId(null);
      });
    });
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const bankRows = board?.bank ?? [];
  const bookRows = board?.book ?? [];
  const selectedBank = useMemo(
    () => bankRows.filter((r) => r.bankLineId && bankSel.includes(r.bankLineId)),
    [bankRows, bankSel],
  );
  const selectedBook = useMemo(
    () => bookRows.filter((r) => r.transactionId && bookSel.includes(r.transactionId)),
    [bookRows, bookSel],
  );
  const bankSum = selectedBank.reduce((s, r) => s + r.amount, 0);
  const bookSum = selectedBook.reduce((s, r) => s + r.amount, 0);
  const canMatch = selectedBank.length > 0 && selectedBook.length > 0;
  const amountsOk = canMatch && Math.abs(bankSum - bookSum) <= 0.02;
  const finished = board?.session.status === 'reconciled';

  function toggle(list: string[], id: string, set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string; confirmed?: number }>, okMsg: string) {
    start(() => {
      fn().then((res) => {
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

  function matchSelected() {
    if (!canMatch) return;
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
    const row = createCaseId
      ? bankRows.find((r) => r.caseId === createCaseId)
      : selectedBank.length === 1
        ? selectedBank[0]
        : null;
    if (!row) {
      pushStatusToast({ kind: 'error', message: 'Select one bank line to add to BookOne.' });
      return;
    }
    const isIn = row.amount > 0;
    run(
      () =>
        createCaseEntry({
          caseId: row.caseId,
          expenseCode: isIn ? undefined : cat,
          incomeCode: isIn ? cat : undefined,
        }),
      'Added to BookOne',
    );
  }

  function waiting() {
    if (selectedBook.length !== 1) {
      pushStatusToast({ kind: 'error', message: 'Select one BookOne line that is not on the statement.' });
      return;
    }
    run(() => markCaseOutstanding({ caseId: selectedBook[0]!.caseId }), 'Marked as not on statement');
  }

  const createRow = createCaseId ? bankRows.find((r) => r.caseId === createCaseId) : selectedBank.length === 1 ? selectedBank[0] : null;
  const createIn = (createRow?.amount ?? 0) > 0;

  useEffect(() => {
    if (!createRow) return;
    setCat(createRow.amount > 0 ? '4000' : '6600');
  }, [createRow]);

  return (
    <div className="brc">
      <header className="brc-head">
        <Link href={inboxHref} className="brc-back">
          ← Imports
        </Link>
        <div className="brc-head-main">
          <h1>
            {board?.session.bankName ?? 'Bank'}
            <span>{board?.session.periodLabel ?? '…'}</span>
          </h1>
          <p>
            Left is BookOne. Right is the bank sheet. Tick two that belong together, then Match.
            Leftover bank lines can be added as new BookOne entries.
          </p>
        </div>
        <div className="brc-head-actions">
          {board && board.obviousCount > 0 && !finished ? (
            <Button
              variant="secondary"
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => bulkConfirmStrongMatches(sessionId), 'Confirmed obvious matches')
              }
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
          ) : (
            <Button
              variant="primary"
              type="button"
              disabled={pending}
              onClick={() => run(() => finishReconciliationSession(sessionId), 'Finished')}
            >
              Finish
            </Button>
          )}
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="brc-stats">
        <div>
          <span>BookOne left</span>
          <strong>{bookRows.length}</strong>
        </div>
        <div>
          <span>Bank left</span>
          <strong>{bankRows.length}</strong>
        </div>
        <div>
          <span>Already matched</span>
          <strong>{board?.review.matched ?? 0}</strong>
        </div>
        <div>
          <span>Added from bank</span>
          <strong>{board?.review.added ?? 0}</strong>
        </div>
        {board?.review.difference != null ? (
          <div>
            <span>Difference</span>
            <strong>{money(board.review.difference)}</strong>
          </div>
        ) : null}
      </div>

      <div className="brc-board">
        <section className="brc-pane">
          <header>
            <h2>BookOne</h2>
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
                  disabled={finished || pending}
                  onToggle={() => row.transactionId && toggle(bookSel, row.transactionId, setBookSel)}
                />
              ))
            )}
          </div>
        </section>
        <section className="brc-pane">
          <header>
            <h2>Bank sheet</h2>
            <small>Lines from the imported statement</small>
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
                  disabled={finished || pending}
                  onToggle={() => {
                    if (!row.bankLineId) return;
                    toggle(bankSel, row.bankLineId, setBankSel);
                    setCreateCaseId(row.caseId);
                  }}
                />
              ))
            )}
          </div>
        </section>
      </div>

      {!finished ? (
        <div className="brc-bar">
          <div className="brc-bar-sums">
            {selectedBook.length > 0 ? <span>BookOne {money(bookSum)}</span> : null}
            {selectedBank.length > 0 ? <span>Bank {money(bankSum)}</span> : null}
            {canMatch && !amountsOk ? (
              <span className="brc-warn">Amounts don’t match — pick different lines, or several that add up.</span>
            ) : null}
          </div>
          <div className="brc-bar-actions">
            <Button variant="primary" type="button" disabled={pending || !canMatch || !amountsOk} onClick={matchSelected}>
              Match
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={pending || selectedBook.length !== 1}
              onClick={waiting}
            >
              Not on statement
            </Button>
            {createRow ? (
              <>
                <select
                  className="input"
                  value={cat}
                  onChange={(e) => setCat(e.target.value)}
                  style={{ maxWidth: 160 }}
                >
                  {(createIn ? IN_CATS : OUT_CATS).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" type="button" disabled={pending} onClick={addToBooks}>
                  Add to BookOne
                </Button>
              </>
            ) : (
              <span className="muted-line">Select one bank line to add it as a new entry.</span>
            )}
          </div>
        </div>
      ) : (
        <p className="muted-line" style={{ padding: '8px 4px' }}>
          This month is finished. Reopen if you need to change a match.
        </p>
      )}

      {board?.review.finishBlockers && board.review.finishBlockers.length > 0 && !finished ? (
        <p className="muted-line">Before finish: {board.review.finishBlockers.join(' · ')}</p>
      ) : null}

      <p className="brc-classic">
        <Link href={classicHref}>Classic workbench</Link>
        {pending ? ' · Working…' : ''}
      </p>
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
      className={`brc-row${selected ? ' is-on' : ''}${row.kind === 'suggested' ? ' is-hint' : ''}${pairOn ? ' is-pair' : ''}`}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="brc-row-date">{day(row.date)}</span>
      <span className="brc-row-body">
        <strong>{row.description}</strong>
        {row.hint ? <small>{row.hint}</small> : null}
      </span>
      <span className={`brc-row-amt${row.amount < 0 ? ' is-out' : ' is-in'}`}>{money(row.amount)}</span>
      <span className="brc-row-side">{side === 'bank' ? 'Bank' : 'Books'}</span>
    </button>
  );
}
