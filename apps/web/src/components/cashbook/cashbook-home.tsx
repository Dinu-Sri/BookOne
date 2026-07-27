'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Landmark,
  Loader2,
  Upload,
} from 'lucide-react';
import { recordEntry } from '@/app/actions/record-entry';
import type { CashbookRow } from '@/app/actions/cashbook';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { gloss, readSiGlossPreference, writeSiGlossPreference } from '@/lib/si-gloss';
import { SiToggle } from '@/components/ui/si-toggle';
import { readBookDomainPref, writeBookDomainPref, type BookDomainPref } from '@/lib/book-domain';
import { canAccessFullErp, type EntityKind } from '@/lib/entity-kind';

type Mode =
  | 'money_in'
  | 'money_out'
  | 'move_money'
  | 'loan'
  | 'invoice'
  | 'bill'
  | null;
type LoanKind = 'loan_took' | 'loan_paid';
type PayMethod = 'Cash' | 'Bank';

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

const BUSINESS_EXPENSE_CATS: { code: string; en: string; si: string }[] = [
  { code: '6000', en: 'Marketing', si: 'අලෙවි' },
  { code: '6100', en: 'Rent', si: 'කුලී' },
  { code: '6200', en: 'Utilities', si: 'යුටිලිටි' },
  { code: '6400', en: 'Travel', si: 'ගමන්' },
  { code: '6500', en: 'Supplies', si: 'සැපයුම්' },
  { code: '6600', en: 'Bank fees', si: 'බැංකු' },
  { code: '5000', en: 'COGS / materials', si: 'පිරිවැය' },
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

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}

function sheetInAmount(r: CashbookRow): string {
  if (r.direction === 'money_in') return r.amount.toFixed(2);
  if (r.direction === 'invoice_bill' && r.accountingType === 'SaleCredit') {
    return r.amount.toFixed(2);
  }
  return '';
}

function sheetOutAmount(r: CashbookRow): string {
  if (r.direction === 'money_out') return r.amount.toFixed(2);
  if (r.direction === 'invoice_bill' && r.accountingType === 'PurchaseCredit') {
    return r.amount.toFixed(2);
  }
  return '';
}

function rowKindLabel(r: CashbookRow): string {
  if (r.direction === 'invoice_bill' && r.accountingType === 'SaleCredit') return 'Invoice';
  if (r.direction === 'invoice_bill' && r.accountingType === 'PurchaseCredit') return 'Bill';
  if (r.direction === 'move_money') return 'Move';
  return '';
}

export function CashbookHomeClient({
  entityKind,
  capabilityTier,
  tenantName,
  initialRows,
  moneyIn,
  moneyOut,
  net,
  period: initialPeriod,
  receivables = 0,
  payables = 0,
}: {
  entityKind: EntityKind;
  capabilityTier?: string | null;
  tenantName: string;
  initialRows: CashbookRow[];
  moneyIn: number;
  moneyOut: number;
  net: number;
  period: string;
  receivables?: number;
  payables?: number;
}) {
  const sole = entityKind === 'sole_prop';
  const fullErp = canAccessFullErp(entityKind, capabilityTier);
  const [si, setSi] = useState(() => readSiGlossPreference());
  const [domain, setDomain] = useState<BookDomainPref>(() =>
    sole ? readBookDomainPref('business') : 'personal',
  );
  const [period, setPeriod] = useState(initialPeriod);
  const [rows, setRows] = useState(initialRows);
  const [sumIn, setSumIn] = useState(moneyIn);
  const [sumOut, setSumOut] = useState(moneyOut);
  const [sumNet, setSumNet] = useState(net);
  const [ar, setAr] = useState(receivables);
  const [ap, setAp] = useState(payables);
  const [mode, setMode] = useState<Mode>(null);
  const [loanKind, setLoanKind] = useState<LoanKind>('loan_took');
  const [party, setParty] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayString());
  const [dueDate, setDueDate] = useState('');
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

  /** Phase 4 tile sets: personal vs business domains differ. */
  const tiles = useMemo(() => {
    if (sole && domain === 'business') {
      return [
        { id: 'money_in' as const, icon: ArrowDownLeft, key: 'money_in' },
        { id: 'money_out' as const, icon: ArrowUpRight, key: 'money_out' },
        { id: 'invoice' as const, icon: FileText, key: 'invoice' },
        { id: 'bill' as const, icon: FileText, key: 'bill' },
        { id: 'move_money' as const, icon: ArrowRightLeft, key: 'move_money' },
      ];
    }
    return [
      { id: 'money_in' as const, icon: ArrowDownLeft, key: 'money_in' },
      { id: 'money_out' as const, icon: ArrowUpRight, key: 'money_out' },
      { id: 'move_money' as const, icon: ArrowRightLeft, key: 'move_money' },
      { id: 'loan' as const, icon: Landmark, key: 'loan' },
    ];
  }, [sole, domain]);

  const expenseCats = domain === 'business' ? BUSINESS_EXPENSE_CATS : PERSONAL_EXPENSE_CATS;

  function navigate(nextDomain: BookDomainPref, nextPeriod: string) {
    const q = new URLSearchParams();
    q.set('domain', nextDomain);
    q.set('period', nextPeriod);
    window.location.href = `/cashbook?${q.toString()}`;
  }

  function switchDomain(d: BookDomainPref) {
    setDomain(d);
    writeBookDomainPref(d);
    navigate(d, period);
  }

  function changePeriod(delta: number) {
    const next = shiftPeriod(period, delta);
    setPeriod(next);
    navigate(domain, next);
  }

  function openMode(m: Mode) {
    setMode(m);
    setError('');
    setParty('');
    setAmount('');
    setDescription('');
    setDate(todayString());
    setDueDate('');
    setLoanKind('loan_took');
    setCategoryCode(domain === 'business' ? '6000' : '6800');
    setIncomeCode(domain === 'business' ? '4000' : '4300');
    setFromPay('Cash');
    setToPay('Bank');
    setPayMethod('Cash');
  }

  function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (mode !== 'move_money' && !party.trim()) {
      setError('Please fill who / customer / vendor.');
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
      let sheetDirection = mode || 'money_out';
      let accountingType: string | null = null;

      if (mode === 'invoice') {
        // Lite customer invoice → AR (SaleCredit), book_domain=business
        sheetDirection = 'invoice_bill';
        accountingType = 'SaleCredit';
        result = await recordEntry({
          direction: 'invoice_bill',
          invoiceType: 'customer_invoice',
          party: party.trim(),
          description: description.trim(),
          amount: amt,
          currency: 'LKR',
          paymentMethod: 'Credit',
          paymentAccount: { kind: 'code', value: '1100' },
          date: baseDate,
          dueDate: dueDate || undefined,
          bookDomain: 'business',
        });
      } else if (mode === 'bill') {
        sheetDirection = 'invoice_bill';
        accountingType = 'PurchaseCredit';
        result = await recordEntry({
          direction: 'invoice_bill',
          invoiceType: 'vendor_bill',
          party: party.trim(),
          description: description.trim(),
          amount: amt,
          currency: 'LKR',
          paymentMethod: 'Credit',
          paymentAccount: { kind: 'code', value: '1100' },
          date: baseDate,
          dueDate: dueDate || undefined,
          bookDomain: 'business',
          categoryOverride: categoryCode,
        });
      } else if (mode === 'loan') {
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
        if (domain === 'personal' && incomeCode === '3000') {
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
            categoryOverride:
              domain === 'personal'
                ? incomeCode
                : domain === 'business'
                  ? '4000'
                  : undefined,
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
          categoryOverride: categoryCode,
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
        description:
          description.trim() ||
          (mode === 'loan' ? gloss(loanKind, si) : mode === 'invoice' || mode === 'bill' ? gloss(mode, si) : ''),
        direction: sheetDirection,
        amount: amt,
        currency: 'LKR',
        bookDomain: mode === 'invoice' || mode === 'bill' ? 'business' : bookDomain,
        accountingType,
      };
      setRows((r) => [row, ...r]);
      if (sheetDirection === 'money_in' || accountingType === 'SaleCredit') {
        setSumIn((v) => v + amt);
        setSumNet((v) => v + amt);
        if (accountingType === 'SaleCredit') setAr((v) => v + amt);
      } else if (sheetDirection === 'money_out' || accountingType === 'PurchaseCredit') {
        setSumOut((v) => v + amt);
        setSumNet((v) => v - amt);
        if (accountingType === 'PurchaseCredit') setAp((v) => v + amt);
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
      showFullErpLink={fullErp}
      right={<SiToggle on={si} onChange={(n) => { setSi(n); writeSiGlossPreference(n); }} />}
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

      <div className="cashbook-period-nav">
        <button type="button" className="cashbook-si-toggle" onClick={() => changePeriod(-1)} aria-label="Previous month">
          <ChevronLeft size={16} />
        </button>
        <span>{period}</span>
        <button type="button" className="cashbook-si-toggle" onClick={() => changePeriod(1)} aria-label="Next month">
          <ChevronRight size={16} />
        </button>
      </div>

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
        {sole && domain === 'business' && (ar > 0 || ap > 0) ? (
          <div className="muted">
            AR {formatLkr(ar)} · AP {formatLkr(ap)}
          </div>
        ) : (
          <div className="muted">{period}</div>
        )}
      </div>

      <div className="cashbook-tiles">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`cashbook-tile action ${mode === t.id ? 'active' : ''} ${
              t.id === 'money_in' || t.id === 'invoice' ? 'in' : t.id === 'money_out' || t.id === 'bill' ? 'out' : ''
            }`}
            onClick={() => openMode(t.id)}
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

          {mode === 'invoice' || mode === 'bill' ? (
            <p className="onboard-lead" style={{ margin: 0, fontSize: 13 }}>
              {mode === 'invoice'
                ? 'Customer invoice on credit (Accounts Receivable). Collect cash later with Money In.'
                : 'Vendor bill on credit (Accounts Payable). Pay later with Money Out.'}
            </p>
          ) : null}

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
                {mode === 'invoice'
                  ? 'Customer'
                  : mode === 'bill'
                    ? 'Vendor'
                    : mode === 'money_in' || (mode === 'loan' && loanKind === 'loan_took')
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
              {mode === 'invoice' || mode === 'bill' ? (
                <label>
                  Due date (optional)
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </label>
              ) : null}

              {(mode === 'money_out' || mode === 'bill') && (
                <div>
                  <span className="cashbook-field-label">Category</span>
                  <div className="cashbook-pay-tiles wrap">
                    {expenseCats.map((c) => (
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
              )}

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

              {mode !== 'invoice' && mode !== 'bill' ? (
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
              ) : null}
            </>
          )}

          {error ? <p className="cashbook-error">{error}</p> : null}
          <button type="button" className="cashbook-save" disabled={pending} onClick={submit}>
            {pending ? <Loader2 className="spin" size={18} /> : null}
            {gloss('save', si)}
          </button>
        </div>
      ) : null}

      <div className="cashbook-sheet-wrap">
        <table className="cashbook-sheet">
          <thead>
            <tr>
              <th>{gloss('date', si)}</th>
              <th>Who</th>
              <th>{gloss('description', si)}</th>
              <th>Type</th>
              <th className="num">In</th>
              <th className="num">Out</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  {domain === 'business'
                    ? 'Tap Money In, Invoice, or Money Out for your first business entry.'
                    : (
                      <>
                        Tap <strong>{gloss('money_out', si)}</strong> to record your first entry.
                      </>
                    )}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.party}</td>
                  <td>{r.description}</td>
                  <td className="muted">{rowKindLabel(r)}</td>
                  <td className="num in">{sheetInAmount(r)}</td>
                  <td className="num out">{sheetOutAmount(r)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </CashbookShell>
  );
}
