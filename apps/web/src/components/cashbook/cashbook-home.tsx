'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  FileText,
  Landmark,
  Loader2,
  Upload,
} from 'lucide-react';
import { recordEntry } from '@/app/actions/record-entry';
import type { CashbookRow } from '@/app/actions/cashbook';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { gloss, readSiGlossPreference, writeSiGlossPreference } from '@/lib/si-gloss';
import { readBookDomainPref, writeBookDomainPref, type BookDomainPref } from '@/lib/book-domain';
import type { EntityKind } from '@/lib/entity-kind';

type Mode = 'money_in' | 'money_out' | 'move_money' | 'loan' | null;
type LoanKind = 'loan_took' | 'loan_paid';
type PayMethod = 'Cash' | 'Bank';

/** Personal expense categories (tile grid) — codes match personal CoA pack */
const PERSONAL_EXPENSE_CATS: { code: string; en: string; si: string }[] = [
  { code: '6300', en: 'Food', si: 'ආහාර' },
  { code: '6100', en: 'Rent', si: 'කුලී' },
  { code: '6200', en: 'Utilities', si: 'යුටිලිටි' },
  { code: '6400', en: 'Transport', si: 'ප්‍රවාහන' },
  { code: '6500', en: 'Health', si: 'සෞඛ්‍ය' },
  { code: '6600', en: 'Education', si: 'අධ්‍යාපන' },
  { code: '6700', en: 'Insurance', si: 'රක්ෂණ' },
  { code: '6800', en: 'Other', si: 'වෙනත්' },
];

const PERSONAL_INCOME_CATS: { code: string; en: string; si: string }[] = [
  { code: '4200', en: 'Salary', si: 'වැටුප' },
  { code: '4300', en: 'Other income', si: 'වෙනත් ආදායම' },
  { code: '3000', en: 'Own money in', si: 'තමාගේ මුදල්' },
];

function formatLkr(n: number) {
  return `LKR ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function payCode(m: PayMethod): string {
  return m === 'Cash' ? '1000' : '1100';
}

export function CashbookHomeClient({
  entityKind,
  tenantName,
  initialRows,
  moneyIn,
  moneyOut,
  net,
  period,
}: {
  entityKind: EntityKind;
  tenantName: string;
  initialRows: CashbookRow[];
  moneyIn: number;
  moneyOut: number;
  net: number;
  period: string;
}) {
  const sole = entityKind === 'sole_prop';
  const personalShell = entityKind === 'personal' || entityKind === 'sole_prop';
  const [si, setSi] = useState(() => readSiGlossPreference());
  const [domain, setDomain] = useState<BookDomainPref>(() =>
    sole ? readBookDomainPref('business') : 'personal',
  );
  const [rows, setRows] = useState(initialRows);
  const [sumIn, setSumIn] = useState(moneyIn);
  const [sumOut, setSumOut] = useState(moneyOut);
  const [sumNet, setSumNet] = useState(net);
  const [mode, setMode] = useState<Mode>(null);
  const [loanKind, setLoanKind] = useState<LoanKind>('loan_took');
  const [party, setParty] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayString());
  const [payMethod, setPayMethod] = useState<PayMethod>('Cash');
  const [fromPay, setFromPay] = useState<PayMethod>('Cash');
  const [toPay, setToPay] = useState<PayMethod>('Bank');
  const [categoryCode, setCategoryCode] = useState('6800');
  const [incomeCode, setIncomeCode] = useState('4300');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const title = useMemo(() => {
    if (entityKind === 'sole_prop') {
      return domain === 'personal'
        ? `${tenantName} · ${gloss('personal', si)}`
        : `${tenantName} · ${gloss('business', si)}`;
    }
    return `${tenantName} · ${gloss('personal', si)}`;
  }, [entityKind, domain, tenantName, si]);

  const tiles = useMemo(() => {
    const base = [
      { id: 'money_in' as const, icon: ArrowDownLeft, key: 'money_in' },
      { id: 'money_out' as const, icon: ArrowUpRight, key: 'money_out' },
      { id: 'move_money' as const, icon: ArrowRightLeft, key: 'move_money' },
      { id: 'loan' as const, icon: Landmark, key: 'loan' },
    ];
    // Sole business: show invoice/bill as placeholders (Phase 4 real forms)
    if (sole && domain === 'business') {
      return [
        ...base.slice(0, 2),
        { id: 'money_in' as const, icon: FileText, key: 'invoice' },
        { id: 'money_out' as const, icon: FileText, key: 'bill' },
        ...base.slice(2),
      ];
    }
    return base;
  }, [sole, domain]);

  function toggleSi() {
    const next = !si;
    setSi(next);
    writeSiGlossPreference(next);
  }

  function switchDomain(d: BookDomainPref) {
    setDomain(d);
    writeBookDomainPref(d);
    window.location.href = `/cashbook?domain=${d}`;
  }

  function openMode(m: Mode) {
    setMode(m);
    setError('');
    setParty('');
    setAmount('');
    setDescription('');
    setDate(todayString());
    setLoanKind('loan_took');
    setCategoryCode('6800');
    setIncomeCode('4300');
    setFromPay('Cash');
    setToPay('Bank');
  }

  function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (mode !== 'move_money' && !party.trim()) {
      setError('Please fill who / reference.');
      return;
    }
    if (mode !== 'move_money' && !description.trim()) {
      setError('Please add a short description.');
      return;
    }
    if (mode === 'move_money' && fromPay === toPay) {
      setError('From and To accounts must be different.');
      return;
    }

    startTransition(async () => {
      setError('');
      const paymentAccount = { kind: 'code' as const, value: payCode(payMethod) };
      const baseDate = date || todayString();
      const bookDomain = domain;

      let result;
      let sheetDirection: string = mode || 'money_out';

      if (mode === 'loan') {
        if (loanKind === 'loan_took') {
          sheetDirection = 'money_in';
          result = await recordEntry({
            direction: 'money_in',
            moneyInType: 'loan_received',
            party: party.trim(),
            description: description.trim() || 'Took a loan',
            amount: amt,
            currency: 'LKR',
            paymentMethod: payMethod,
            paymentAccount,
            date: baseDate,
            bookDomain,
          });
        } else {
          sheetDirection = 'money_out';
          result = await recordEntry({
            direction: 'money_out',
            party: party.trim(),
            description: description.trim() || 'Paid loan',
            amount: amt,
            currency: 'LKR',
            paymentMethod: payMethod,
            paymentAccount,
            date: baseDate,
            bookDomain,
            categoryOverride: '2500',
          });
        }
      } else if (mode === 'money_in') {
        sheetDirection = 'money_in';
        // Own money in → equity; else income/sale with category
        if (incomeCode === '3000') {
          result = await recordEntry({
            direction: 'money_in',
            moneyInType: 'owner_contribution',
            party: party.trim(),
            description: description.trim(),
            amount: amt,
            currency: 'LKR',
            paymentMethod: payMethod,
            paymentAccount,
            date: baseDate,
            bookDomain,
          });
        } else {
          result = await recordEntry({
            direction: 'money_in',
            moneyInType: 'new_sale',
            party: party.trim(),
            description: description.trim(),
            amount: amt,
            currency: 'LKR',
            paymentMethod: payMethod,
            paymentAccount,
            date: baseDate,
            bookDomain,
            categoryOverride: personalShell && domain === 'personal' ? incomeCode : undefined,
          });
        }
      } else if (mode === 'money_out') {
        sheetDirection = 'money_out';
        result = await recordEntry({
          direction: 'money_out',
          party: party.trim(),
          description: description.trim(),
          amount: amt,
          currency: 'LKR',
          paymentMethod: payMethod,
          paymentAccount,
          date: baseDate,
          bookDomain,
          categoryOverride:
            personalShell && domain === 'personal' ? categoryCode : undefined,
        });
      } else if (mode === 'move_money') {
        sheetDirection = 'move_money';
        result = await recordEntry({
          direction: 'move_money',
          party: party.trim() || 'Transfer',
          description: description.trim() || `${fromPay} → ${toPay}`,
          amount: amt,
          currency: 'LKR',
          paymentMethod: toPay,
          paymentAccount: { kind: 'code', value: payCode(toPay) },
          fromAccount: { kind: 'code', value: payCode(fromPay) },
          toAccount: { kind: 'code', value: payCode(toPay) },
          date: baseDate,
          bookDomain,
        });
      } else {
        return;
      }

      if (!result.success) {
        setError(result.error || 'Could not save');
        return;
      }

      const row: CashbookRow = {
        id: result.transactionId || String(Date.now()),
        date: baseDate,
        party: party.trim() || 'Transfer',
        description: description.trim() || (mode === 'loan' ? gloss(loanKind, si) : ''),
        direction: sheetDirection === 'move_money' ? 'move_money' : sheetDirection,
        amount: amt,
        currency: 'LKR',
        bookDomain,
      };
      setRows((r) => [row, ...r]);
      if (sheetDirection === 'money_in') {
        setSumIn((v) => v + amt);
        setSumNet((v) => v + amt);
      } else if (sheetDirection === 'money_out') {
        setSumOut((v) => v + amt);
        setSumNet((v) => v - amt);
      }
      setMode(null);
    });
  }

  const formTitle =
    mode === 'loan'
      ? gloss(loanKind, si)
      : mode
        ? gloss(mode, si)
        : '';

  return (
    <CashbookShell
      title={title}
      active="home"
      si={si}
      right={
        <button type="button" className="cashbook-si-toggle" onClick={toggleSi}>
          {si ? 'SI ✓' : 'SI'}
        </button>
      }
    >
      {sole ? (
        <div className="cashbook-domain">
          <button
            type="button"
            className={`cashbook-tile domain ${domain === 'personal' ? 'active' : ''}`}
            onClick={() => switchDomain('personal')}
          >
            {gloss('personal', si)}
          </button>
          <button
            type="button"
            className={`cashbook-tile domain ${domain === 'business' ? 'active' : ''}`}
            onClick={() => switchDomain('business')}
          >
            {gloss('business', si)}
          </button>
        </div>
      ) : null}

      <div className="cashbook-summary">
        <div>
          <span>{gloss('money_in', si)}</span>
          <strong className="in">{formatLkr(sumIn)}</strong>
        </div>
        <div>
          <span>{gloss('money_out', si)}</span>
          <strong className="out">{formatLkr(sumOut)}</strong>
        </div>
        <div>
          <span>Net</span>
          <strong>{formatLkr(sumNet)}</strong>
        </div>
        <div className="muted">{period}</div>
      </div>

      <div className="cashbook-tiles">
        {tiles.map((t) => (
          <button
            key={t.key + t.id}
            type="button"
            className={`cashbook-tile action ${mode === t.id && t.key !== 'invoice' && t.key !== 'bill' ? 'active' : ''} ${t.id === 'money_in' ? 'in' : t.id === 'money_out' ? 'out' : ''}`}
            onClick={() => {
              if (t.key === 'invoice' || t.key === 'bill') {
                setError('Lite invoice/bill forms come in the next phase. Use Money In/Out for now.');
                setMode(null);
                return;
              }
              openMode(t.id);
            }}
          >
            <t.icon size={22} />
            <span>{gloss(t.key, si)}</span>
          </button>
        ))}
        <button type="button" className="cashbook-tile action muted" disabled title="Coming soon">
          <Upload size={22} />
          <span>{gloss('import_excel', si)}</span>
        </button>
      </div>

      {mode ? (
        <div className="cashbook-entry-card">
          <div className="cashbook-entry-head">
            <strong>{formTitle}</strong>
            <button type="button" className="linkish" onClick={() => setMode(null)}>
              Close
            </button>
          </div>

          {mode === 'loan' ? (
            <div className="cashbook-pay-tiles" style={{ marginBottom: 8 }}>
              {(['loan_took', 'loan_paid'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`cashbook-tile pay ${loanKind === k ? 'active' : ''}`}
                  onClick={() => setLoanKind(k)}
                >
                  {gloss(k, si)}
                </button>
              ))}
            </div>
          ) : null}

          {mode === 'move_money' ? (
            <>
              <label>
                From
                <div className="cashbook-pay-tiles">
                  {(['Cash', 'Bank'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`cashbook-tile pay ${fromPay === m ? 'active' : ''}`}
                      onClick={() => setFromPay(m)}
                    >
                      {gloss(m.toLowerCase(), si)}
                    </button>
                  ))}
                </div>
              </label>
              <label>
                To
                <div className="cashbook-pay-tiles">
                  {(['Cash', 'Bank'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`cashbook-tile pay ${toPay === m ? 'active' : ''}`}
                      onClick={() => setToPay(m)}
                    >
                      {gloss(m.toLowerCase(), si)}
                    </button>
                  ))}
                </div>
              </label>
              <label>
                {gloss('amount', si)}
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </label>
              <label>
                {gloss('date', si)}
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label>
                Note (optional)
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. ATM withdrawal"
                />
              </label>
            </>
          ) : (
            <>
              <label>
                {mode === 'money_in' || (mode === 'loan' && loanKind === 'loan_took')
                  ? gloss('from_whom', si)
                  : gloss('paid_to', si)}
                <input value={party} onChange={(e) => setParty(e.target.value)} autoFocus />
              </label>
              <label>
                {gloss('amount', si)}
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label>
                {gloss('description', si)}
                <input value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <label>
                {gloss('date', si)}
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>

              {mode === 'money_out' && domain === 'personal' ? (
                <div>
                  <span className="cashbook-field-label">Category</span>
                  <div className="cashbook-pay-tiles wrap">
                    {PERSONAL_EXPENSE_CATS.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        className={`cashbook-tile pay ${categoryCode === c.code ? 'active' : ''}`}
                        onClick={() => setCategoryCode(c.code)}
                      >
                        {c.en}
                        {si ? <small> ({c.si})</small> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {mode === 'money_in' && domain === 'personal' ? (
                <div>
                  <span className="cashbook-field-label">Type</span>
                  <div className="cashbook-pay-tiles wrap">
                    {PERSONAL_INCOME_CATS.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        className={`cashbook-tile pay ${incomeCode === c.code ? 'active' : ''}`}
                        onClick={() => setIncomeCode(c.code)}
                      >
                        {c.en}
                        {si ? <small> ({c.si})</small> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="cashbook-pay-tiles">
                {(['Cash', 'Bank'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`cashbook-tile pay ${payMethod === m ? 'active' : ''}`}
                    onClick={() => setPayMethod(m)}
                  >
                    {gloss(m.toLowerCase(), si)}
                  </button>
                ))}
              </div>
            </>
          )}

          {error ? <p className="cashbook-error">{error}</p> : null}
          <button type="button" className="cashbook-save" disabled={pending} onClick={submit}>
            {pending ? <Loader2 className="spin" size={18} /> : null}
            {gloss('save', si)}
          </button>
        </div>
      ) : null}

      {!mode && error ? <p className="cashbook-error">{error}</p> : null}

      <div className="cashbook-sheet-wrap">
        <table className="cashbook-sheet">
          <thead>
            <tr>
              <th>{gloss('date', si)}</th>
              <th>Who</th>
              <th>{gloss('description', si)}</th>
              <th className="num">In</th>
              <th className="num">Out</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Tap <strong>{gloss('money_out', si)}</strong> to record your first entry.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.party}</td>
                  <td>{r.description}</td>
                  <td className="num in">
                    {r.direction === 'money_in' ? r.amount.toFixed(2) : ''}
                  </td>
                  <td className="num out">
                    {r.direction === 'money_out' ? r.amount.toFixed(2) : ''}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </CashbookShell>
  );
}
