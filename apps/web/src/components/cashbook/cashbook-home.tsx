'use client';

/**
 * Cashbook home — implements BookOne UX Redesign Guide (Downloads/bookone-ux-redesign-guide.md)
 *
 * P0: bottom-sheet form, no Import Excel, no silent category default, unambiguous dates
 * P1: green/red Money In/Out, two-tier tiles, running balance ledger
 * P2: plain-language categories, last-used defaults, chrome in ⋮ menu
 * P3 (not built): inline spreadsheet row entry — prototype later
 */

import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Landmark,
  Loader2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { recordEntry, reverseTransactionById } from '@/app/actions/record-entry';
import type { CashbookRow } from '@/app/actions/cashbook';
import { listLiquidAccounts, type LiquidAccount } from '@/app/actions/cashbook-banks';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { DateField } from '@/components/ui/date-field';
import { gloss, readSiGlossPreference } from '@/lib/si-gloss';
import { readBookDomainPref, writeBookDomainPref, type BookDomainPref } from '@/lib/book-domain';
import { canAccessFullErp, type EntityKind } from '@/lib/entity-kind';
import {
  formatAmountInput,
  formatDisplayDate,
  formatPeriodLabel,
  parseAmountInput,
  readLastCategory,
  readLastPayMethod,
  writeLastCategory,
  writeLastPayMethod,
} from '@/lib/cashbook-prefs';

type Mode =
  | 'money_in'
  | 'money_out'
  | 'move_money'
  | 'loan'
  | 'invoice'
  | 'bill'
  | null;
type LoanKind = 'loan_took' | 'loan_paid';
type PayMethod = 'Cash' | 'Bank' | 'Card';

function methodFromCode(code: string): PayMethod {
  if (code === '1000') return 'Cash';
  if (code === '1200' || code.startsWith('12')) return 'Card';
  return 'Bank';
}

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

/** Plain language — guide: rename COGS */
const BUSINESS_EXPENSE_CATS: { code: string; en: string; si: string }[] = [
  { code: '6000', en: 'Marketing', si: 'අලෙවි' },
  { code: '6100', en: 'Rent', si: 'කුලී' },
  { code: '6200', en: 'Utilities', si: 'යුටිලිටි' },
  { code: '6400', en: 'Travel', si: 'ගමන්' },
  { code: '6500', en: 'Supplies', si: 'සැපයුම්' },
  { code: '6600', en: 'Bank fees', si: 'බැංකු' },
  { code: '5000', en: 'Goods for resale', si: 'විකුණුම් භාණ්ඩ' },
  { code: '6800', en: 'Other', si: 'වෙනත්' },
];

const PERSONAL_INCOME_CATS: { code: string; en: string; si: string }[] = [
  { code: '4200', en: 'Salary', si: 'වැටුප' },
  { code: '4300', en: 'Other income', si: 'වෙනත් ආදායම' },
  { code: '3000', en: 'Own money in', si: 'තමාගේ මුදල්' },
];

/** Business money-in sources (guide §4.3 deliberate decision) */
const BUSINESS_INCOME_CATS: { code: string; en: string; si: string }[] = [
  { code: '4000', en: 'Sales', si: 'විකුණුම්' },
  { code: '4300', en: 'Other income', si: 'වෙනත් ආදායම' },
  { code: '3000', en: 'Own money in', si: 'තමාගේ මුදල්' },
];

function formatRs(n: number) {
  // Guide §5.6: Rs. is more familiar colloquially; keep formal enough with Rs.
  return `Rs. ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function rowSignedDelta(r: CashbookRow): number {
  if (r.direction === 'money_in') return r.amount;
  if (r.direction === 'money_out') return -r.amount;
  if (r.direction === 'invoice_bill' && r.accountingType === 'SaleCredit') return r.amount;
  if (r.direction === 'invoice_bill' && r.accountingType === 'PurchaseCredit') return -r.amount;
  return 0;
}

function sheetInAmount(r: CashbookRow): number | null {
  if (r.direction === 'money_in') return r.amount;
  if (r.direction === 'invoice_bill' && r.accountingType === 'SaleCredit') return r.amount;
  return null;
}

function sheetOutAmount(r: CashbookRow): number | null {
  if (r.direction === 'money_out') return r.amount;
  if (r.direction === 'invoice_bill' && r.accountingType === 'PurchaseCredit') return r.amount;
  return null;
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
  const [amountDisplay, setAmountDisplay] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayString());
  const [dueDate, setDueDate] = useState('');
  /** Liquid account codes (1000 cash, 1100+ banks) */
  const [liquid, setLiquid] = useState<LiquidAccount[]>([]);
  const [payCodeSelected, setPayCodeSelected] = useState('1000');
  const [fromCode, setFromCode] = useState('1000');
  const [toCode, setToCode] = useState('1100');
  /** Empty string = must choose (guide: no silent Marketing/Other default) */
  const [categoryCode, setCategoryCode] = useState('');
  const [incomeCode, setIncomeCode] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listLiquidAccounts()
      .then((rows) => {
        setLiquid(rows);
        if (rows.length) {
          const cash = rows.find((r) => r.code === '1000')?.code ?? rows[0]!.code;
          const bank = rows.find((r) => r.kind === 'bank')?.code ?? rows.find((r) => r.code !== cash)?.code ?? cash;
          setPayCodeSelected((c) => (rows.some((r) => r.code === c) ? c : cash));
          setFromCode((c) => (rows.some((r) => r.code === c) ? c : cash));
          setToCode((c) => (rows.some((r) => r.code === c) ? c : bank));
        }
      })
      .catch(() => setLiquid([]));
  }, []);

  const title = useMemo(() => {
    if (entityKind === 'sole_prop') {
      return domain === 'personal'
        ? `${tenantName} · ${gloss('personal', si)}`
        : `${tenantName} · ${gloss('business', si)}`;
    }
    return `${tenantName} · ${gloss('personal', si)}`;
  }, [entityKind, domain, tenantName, si]);

  /** Tier 2 only — Invoice/Bill on business; Loan on personal (guide §5.1) */
  const tier2 = useMemo(() => {
    if (sole && domain === 'business') {
      return [
        { id: 'invoice' as const, icon: FileText, key: 'invoice' },
        { id: 'bill' as const, icon: FileText, key: 'bill' },
        { id: 'move_money' as const, icon: ArrowRightLeft, key: 'move_money' },
      ];
    }
    return [
      { id: 'move_money' as const, icon: ArrowRightLeft, key: 'move_money' },
      { id: 'loan' as const, icon: Landmark, key: 'loan' },
    ];
  }, [sole, domain]);

  const expenseCats = domain === 'business' ? BUSINESS_EXPENSE_CATS : PERSONAL_EXPENSE_CATS;
  const incomeCats = domain === 'business' ? BUSINESS_INCOME_CATS : PERSONAL_INCOME_CATS;

  /** Running balance: list is newest-first; balances run oldest→newest then reverse for display */
  const rowsWithBalance = useMemo(() => {
    const chronological = [...rows].reverse();
    let bal = 0;
    const withBal = chronological.map((r) => {
      bal += rowSignedDelta(r);
      return { ...r, balance: bal };
    });
    return withBal.reverse();
  }, [rows]);

  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), 2200);
    return () => clearTimeout(t);
  }, [savedFlash]);

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
    setEditingId(null);
    setError('');
    setParty('');
    setAmountDisplay('');
    setDescription('');
    setDate(todayString());
    setDueDate('');
    setLoanKind('loan_took');
    setShowDetails(false);
    if (m === 'money_out' || m === 'bill') {
      const last = readLastCategory(domain, m);
      const valid = expenseCats.some((c) => c.code === last);
      setCategoryCode(valid && last ? last : '');
    } else {
      setCategoryCode('');
    }
    if (m === 'money_in') {
      const last = readLastCategory(domain, 'money_in');
      const valid = incomeCats.some((c) => c.code === last);
      setIncomeCode(valid && last ? last : '');
    } else {
      setIncomeCode('');
    }
    const lastPay = readLastPayMethod();
    const cash = liquid.find((a) => a.code === '1000')?.code ?? liquid[0]?.code ?? '1000';
    const bank = liquid.find((a) => a.kind === 'bank')?.code ?? liquid.find((a) => a.code !== cash)?.code ?? '1100';
    if (lastPay === 'Cash') setPayCodeSelected(cash);
    else if (lastPay === 'Bank') setPayCodeSelected(bank);
    else setPayCodeSelected(cash);
    setFromCode(cash);
    setToCode(bank);
  }

  /** Double-click ledger row → edit sheet (reverse + re-post on save). */
  function openEdit(r: CashbookRow) {
    let m: Mode = null;
    if (r.direction === 'money_in') m = 'money_in';
    else if (r.direction === 'money_out') m = 'money_out';
    else if (r.direction === 'move_money') m = 'move_money';
    else if (r.direction === 'invoice_bill' && r.accountingType === 'SaleCredit') m = 'invoice';
    else if (r.direction === 'invoice_bill' && r.accountingType === 'PurchaseCredit') m = 'bill';
    if (!m) return;

    setEditingId(r.id);
    setMode(m);
    setError('');
    setParty(r.party === '—' ? '' : r.party);
    setAmountDisplay(formatAmountInput(String(r.amount)));
    setDescription(r.description);
    setDate(r.date);
    setDueDate('');
    setShowDetails(true);
    setCategoryCode(r.categoryCode && expenseCats.some((c) => c.code === r.categoryCode) ? r.categoryCode : '');
    setIncomeCode(r.categoryCode && incomeCats.some((c) => c.code === r.categoryCode) ? r.categoryCode : '');
    if (r.paymentAccountCode) setPayCodeSelected(r.paymentAccountCode);
    if (r.direction === 'move_money') {
      if (r.transferSourceCode) setFromCode(r.transferSourceCode);
      if (r.paymentAccountCode) setToCode(r.paymentAccountCode);
    }
  }

  function closeSheet() {
    setMode(null);
    setEditingId(null);
    setError('');
  }

  function submit() {
    const amt = parseAmountInput(amountDisplay);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError(si ? 'වලංගු මුදලක් ඇතුළත් කරන්න.' : 'Enter a valid amount.');
      return;
    }
    // Quick path: amount required; who optional for pure cash expense with description
    if (mode !== 'move_money' && !party.trim() && !description.trim()) {
      setError(si ? 'කවුද / විස්තරය එකක්වත් දෙන්න.' : 'Add who or a short description.');
      return;
    }
    if ((mode === 'money_out' || mode === 'bill') && !categoryCode) {
      setError(si ? 'ප්‍රවර්ගයක් තෝරන්න.' : 'Choose a category.');
      return;
    }
    if (mode === 'money_in' && !incomeCode) {
      setError(si ? 'ආදායම් වර්ගය තෝරන්න.' : 'Choose where this money came from.');
      return;
    }
    if (mode === 'move_money' && fromCode === toCode) {
      setError(si ? 'සිට සහ දක්වා වෙනස් විය යුතුය.' : 'From and To must be different.');
      return;
    }

    startTransition(async () => {
      setError('');
      // Edit = reverse original then re-post (keeps double-entry integrity)
      if (editingId) {
        const rev = await reverseTransactionById(editingId);
        if (!rev.success) {
          setError(rev.error || 'Could not reverse original entry for edit.');
          return;
        }
      }

      const payMethod = methodFromCode(payCodeSelected);
      const paymentAccount = { kind: 'code' as const, value: payCodeSelected };
      const baseDate = date || todayString();
      const bookDomain = domain;
      const desc =
        description.trim() ||
        (mode === 'loan'
          ? gloss(loanKind, false)
          : mode === 'money_out' || mode === 'bill'
            ? expenseCats.find((c) => c.code === categoryCode)?.en || 'Expense'
            : mode === 'money_in'
              ? incomeCats.find((c) => c.code === incomeCode)?.en || 'Income'
              : 'Entry');

      let result;
      let sheetDirection = mode || 'money_out';
      let accountingType: string | null = null;

      if (mode === 'invoice') {
        sheetDirection = 'invoice_bill';
        accountingType = 'SaleCredit';
        result = await recordEntry({
          direction: 'invoice_bill',
          invoiceType: 'customer_invoice',
          party: party.trim() || 'Customer',
          description: desc,
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
          party: party.trim() || 'Vendor',
          description: desc,
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
            party: party.trim() || 'Lender',
            description: desc,
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
            party: party.trim() || 'Lender',
            description: desc,
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
        if (incomeCode === '3000') {
          result = await recordEntry({
            direction: 'money_in',
            moneyInType: 'owner_contribution',
            party: party.trim() || 'Owner',
            description: desc,
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
            party: party.trim() || 'Customer',
            description: desc,
            amount: amt,
            currency: 'LKR',
            paymentMethod: payMethod,
            paymentAccount,
            date: baseDate,
            bookDomain,
            categoryOverride: incomeCode,
          });
        }
      } else if (mode === 'money_out') {
        sheetDirection = 'money_out';
        result = await recordEntry({
          direction: 'money_out',
          party: party.trim() || 'Payee',
          description: desc,
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
        const fromName = liquid.find((a) => a.code === fromCode)?.shortName ?? fromCode;
        const toName = liquid.find((a) => a.code === toCode)?.shortName ?? toCode;
        result = await recordEntry({
          direction: 'move_money',
          party: party.trim() || 'Transfer',
          description: desc || `${fromName} → ${toName}`,
          amount: amt,
          currency: 'LKR',
          paymentMethod: methodFromCode(toCode),
          paymentAccount: { kind: 'code', value: toCode },
          fromAccount: { kind: 'code', value: fromCode },
          toAccount: { kind: 'code', value: toCode },
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

      if (mode === 'money_out' || mode === 'bill') {
        writeLastCategory(domain, mode, categoryCode);
      }
      if (mode === 'money_in') writeLastCategory(domain, 'money_in', incomeCode);
      if (mode !== 'invoice' && mode !== 'bill') writeLastPayMethod(payMethod);

      if (editingId) {
        // Remove original from sheet (reversed); append new
        setRows((prev) => {
          const without = prev.filter((x) => x.id !== editingId);
          const row: CashbookRow = {
            id: result.transactionId || String(Date.now()),
            date: baseDate,
            party: party.trim() || '—',
            description: desc,
            direction: sheetDirection,
            amount: amt,
            currency: 'LKR',
            bookDomain: mode === 'invoice' || mode === 'bill' ? 'business' : bookDomain,
            accountingType,
            paymentAccountCode: mode === 'move_money' ? toCode : payCodeSelected,
            transferSourceCode: mode === 'move_money' ? fromCode : null,
            categoryCode: categoryCode || incomeCode || null,
          };
          return [row, ...without];
        });
        // Totals: simplest full recalculation from remaining rows is hard; reload page for accuracy
        window.location.reload();
        return;
      }

      const row: CashbookRow = {
        id: result.transactionId || String(Date.now()),
        date: baseDate,
        party: party.trim() || '—',
        description: desc,
        amount: amt,
        currency: 'LKR',
        direction: sheetDirection,
        bookDomain: mode === 'invoice' || mode === 'bill' ? 'business' : bookDomain,
        accountingType,
        paymentAccountCode: mode === 'move_money' ? toCode : payCodeSelected,
        transferSourceCode: mode === 'move_money' ? fromCode : null,
        categoryCode: categoryCode || incomeCode || null,
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
      setEditingId(null);
      setSavedFlash(true);
    });
  }

  function LiquidTiles({
    value,
    onChange,
  }: {
    value: string;
    onChange: (code: string) => void;
  }) {
    const list =
      liquid.length > 0
        ? liquid
        : [
            { id: 'c', code: '1000', name: 'Cash', shortName: 'Cash', kind: 'cash' as const },
            { id: 'b', code: '1100', name: 'Bank', shortName: 'Bank', kind: 'bank' as const },
          ];
    return (
      <div className="cb-liquid-tiles cashbook-pay-tiles wrap">
        {list.map((a) => (
          <button
            key={a.code}
            type="button"
            className={`cashbook-tile pay ${value === a.code ? 'active' : ''}`}
            onClick={() => onChange(a.code)}
          >
            {a.shortName}
          </button>
        ))}
      </div>
    );
  }

  const formTitle =
    mode === 'loan' ? gloss(loanKind, si) : mode ? gloss(mode, si) : '';

  const emptyHint =
    domain === 'business'
      ? si
        ? 'ආදායම හෝ වියදම තට්ටුව තට්ටු කරන්න.'
        : 'Tap Money In or Money Out to record your first entry.'
      : si
        ? 'වියදම තට්ටුව තට්ටු කර පළමු ඇතුළත් කිරීම සුරකින්න.'
        : 'Tap Money Out to record your first entry.';

  return (
    <CashbookShell
      title={title}
      active="home"
      si={si}
      showFullErpLink={fullErp}
      onSiChange={setSi}
    >
      {savedFlash ? (
        <div className="cb-saved-toast" role="status">
          <CheckCircle2 size={18} />
          <span>{si ? 'සුරකින ලදී' : 'Saved'}</span>
        </div>
      ) : null}

      {sole ? (
        <div className="cashbook-domain">
          <button
            type="button"
            className={`cashbook-tile domain ${domain === 'personal' ? 'active' : ''}`}
            onClick={() => switchDomain('personal')}
          >
            <span className={si ? 'si-text' : undefined}>{gloss('personal', si)}</span>
          </button>
          <button
            type="button"
            className={`cashbook-tile domain ${domain === 'business' ? 'active' : ''}`}
            onClick={() => switchDomain('business')}
          >
            <span className={si ? 'si-text' : undefined}>{gloss('business', si)}</span>
          </button>
        </div>
      ) : null}

      <div className="cashbook-period-nav">
        <button
          type="button"
          className="cashbook-period-btn"
          onClick={() => changePeriod(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="cashbook-period-label">{formatPeriodLabel(period)}</span>
        <button
          type="button"
          className="cashbook-period-btn"
          onClick={() => changePeriod(1)}
          aria-label="Next month"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Summary — no duplicate month (guide §5.5) */}
      <div className="cashbook-summary cashbook-summary-3">
        <div>
          <span>{gloss('money_in', si)}</span>
          <strong className="in">{formatRs(sumIn)}</strong>
        </div>
        <div>
          <span>{gloss('money_out', si)}</span>
          <strong className="out">{formatRs(sumOut)}</strong>
        </div>
        <div>
          <span>{gloss('net', si)}</span>
          <strong className={sumNet >= 0 ? 'in' : 'out'}>{formatRs(sumNet)}</strong>
        </div>
      </div>
      {sole && domain === 'business' && (ar > 0 || ap > 0) ? (
        <p className="cb-arap-line">
          AR {formatRs(ar)} · AP {formatRs(ap)}
        </p>
      ) : null}

      {/* Tier 1 — Money In / Money Out (guide §5.1) */}
      <div className="cb-tier1">
        <button type="button" className="cb-primary-tile in" onClick={() => openMode('money_in')}>
          <ArrowDownLeft size={28} strokeWidth={2.25} />
          <span className={si ? 'si-text' : undefined}>{gloss('money_in', si)}</span>
        </button>
        <button type="button" className="cb-primary-tile out" onClick={() => openMode('money_out')}>
          <ArrowUpRight size={28} strokeWidth={2.25} />
          <span className={si ? 'si-text' : undefined}>{gloss('money_out', si)}</span>
        </button>
      </div>

      {/* Tier 2 — more actions + Import bank (safe staged import) */}
      <div className="cb-tier2-wrap">
        <span className="cb-tier2-label">{si ? 'තවත්' : 'More actions'}</span>
        <div className="cb-tier2">
          {tier2.map((t) => (
            <button
              key={t.key}
              type="button"
              className="cb-secondary-tile"
              onClick={() => openMode(t.id)}
            >
              <t.icon size={18} />
              <span className={si ? 'si-text' : undefined}>{gloss(t.key, si)}</span>
            </button>
          ))}
          <Link
            href={`/cashbook/import${domain ? `?domain=${domain}` : ''}`}
            className="cb-secondary-tile"
          >
            <FileSpreadsheet size={18} />
            <span className={si ? 'si-text' : undefined}>
              {si ? 'බැංකු Excel' : 'Import bank'}
            </span>
          </Link>
        </div>
      </div>

      {/* Ledger table (guide §5.3) */}
      <div className="cashbook-sheet-wrap">
        <table className="cashbook-sheet cashbook-ledger">
          <thead>
            <tr>
              <th>{gloss('date', si)}</th>
              <th>{si ? 'කවුද' : 'Who'}</th>
              <th>{gloss('description', si)}</th>
              <th className="num">{si ? 'ආදායම' : 'In'}</th>
              <th className="num">{si ? 'වියදම' : 'Out'}</th>
              <th className="num">{si ? 'ශේෂය' : 'Bal.'}</th>
            </tr>
          </thead>
          <tbody>
            {rowsWithBalance.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  {emptyHint}
                </td>
              </tr>
            ) : (
              rowsWithBalance.map((r, i) => {
                const inn = sheetInAmount(r);
                const out = sheetOutAmount(r);
                return (
                  <tr
                    key={r.id}
                    className={i % 2 === 1 ? 'zebra' : undefined}
                    title={si ? 'සංස්කරණයට දෙවරක් තට්ටු කරන්න' : 'Double-click to edit'}
                    onDoubleClick={() => openEdit(r)}
                  >
                    <td className="cb-date">{formatDisplayDate(r.date)}</td>
                    <td>
                      <span className={`cb-dir-dot ${inn != null ? 'in' : out != null ? 'out' : 'neu'}`} />
                      {r.party}
                    </td>
                    <td>{r.description}</td>
                    <td className="num in">{inn != null ? inn.toFixed(2) : ''}</td>
                    <td className="num out">{out != null ? out.toFixed(2) : ''}</td>
                    <td className={`num bal ${r.balance >= 0 ? 'in' : 'out'}`}>
                      {r.balance.toFixed(2)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rowsWithBalance.length > 0 ? (
            <tfoot>
              <tr className="cb-ledger-foot">
                <td colSpan={3}>{si ? 'මුළු' : 'Totals'}</td>
                <td className="num in">{sumIn.toFixed(2)}</td>
                <td className="num out">{sumOut.toFixed(2)}</td>
                <td className={`num bal ${sumNet >= 0 ? 'in' : 'out'}`}>{sumNet.toFixed(2)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {/* Bottom sheet overlay (guide §5.2) — does not grow page */}
      {mode ? (
        <div className="cb-sheet-root" role="dialog" aria-modal="true" aria-label={formTitle}>
          <button type="button" className="cb-sheet-backdrop" aria-label="Close" onClick={closeSheet} />
          <div className="cb-sheet">
            <div className="cb-sheet-handle" aria-hidden />
            <div className="cb-sheet-head">
              <strong className={si ? 'si-text' : undefined}>
                {editingId ? (si ? 'සංස්කරණය' : 'Edit') + ' · ' : ''}
                {formTitle}
              </strong>
              <button type="button" className="cb-sheet-close" onClick={closeSheet} aria-label="Close">
                <X size={22} />
              </button>
            </div>

            <div className="cb-sheet-body cb-sheet-dense">
              {mode === 'invoice' || mode === 'bill' ? (
                <p className="cb-sheet-hint">
                  {mode === 'invoice'
                    ? si
                      ? 'ණයට ඉන්වොයිස් — පසුව මුදල් එකතු කරන්න.'
                      : 'Credit invoice — collect cash later with Money In.'
                    : si
                      ? 'ණයට බිල් — පසුව ගෙවන්න.'
                      : 'Credit bill — pay later with Money Out.'}
                </p>
              ) : null}

              {mode === 'loan' ? (
                <div className="cashbook-pay-tiles wrap">
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
                  <label className="cb-field">
                    <span>{si ? 'සිට' : 'From'}</span>
                    <LiquidTiles value={fromCode} onChange={setFromCode} />
                  </label>
                  <label className="cb-field">
                    <span>{si ? 'දක්වා' : 'To'}</span>
                    <LiquidTiles value={toCode} onChange={setToCode} />
                  </label>
                </>
              ) : (
                <label className="cb-field">
                  <span>
                    {mode === 'invoice'
                      ? si
                        ? 'පාරිභෝගික'
                        : 'Customer'
                      : mode === 'bill'
                        ? si
                          ? 'සැපයුම්කරු'
                          : 'Vendor'
                        : mode === 'money_in' || (mode === 'loan' && loanKind === 'loan_took')
                          ? gloss('from_whom', si)
                          : gloss('paid_to', si)}
                  </span>
                  <input
                    value={party}
                    onChange={(e) => setParty(e.target.value)}
                    autoComplete="off"
                    placeholder={si ? 'නම' : 'Name'}
                  />
                </label>
              )}

              {/* Amount — largest field (guide §7) */}
              <label className="cb-field cb-amount-field">
                <span>{gloss('amount', si)}</span>
                <input
                  inputMode="decimal"
                  className="cb-amount-input"
                  value={amountDisplay}
                  onChange={(e) => setAmountDisplay(formatAmountInput(e.target.value))}
                  placeholder="0.00"
                  autoFocus
                />
              </label>

              {/* Categories — explicit choice, last-used preselect if any */}
              {(mode === 'money_out' || mode === 'bill') && (
                <div className="cb-field">
                  <span className="cashbook-field-label">
                    {si ? 'ප්‍රවර්ගය' : 'Category'}
                    {!categoryCode ? (
                      <em className="cb-required"> {si ? '(අවශ්‍ය)' : '(required)'}</em>
                    ) : null}
                  </span>
                  <div className="cashbook-pay-tiles wrap">
                    {expenseCats.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        className={`cashbook-tile pay ${categoryCode === c.code ? 'active' : ''}`}
                        onClick={() => setCategoryCode(c.code)}
                      >
                        {si ? c.si : c.en}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mode === 'money_in' && (
                <div className="cb-field">
                  <span className="cashbook-field-label">
                    {si ? 'මුදල් ආවේ කොහෙන්ද' : 'Where from'}
                    {!incomeCode ? (
                      <em className="cb-required"> {si ? '(අවශ්‍ය)' : '(required)'}</em>
                    ) : null}
                  </span>
                  <div className="cashbook-pay-tiles wrap">
                    {incomeCats.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        className={`cashbook-tile pay ${incomeCode === c.code ? 'active' : ''}`}
                        onClick={() => setIncomeCode(c.code)}
                      >
                        {si ? c.si : c.en}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mode !== 'invoice' && mode !== 'bill' && mode !== 'move_money' ? (
                <div className="cb-field">
                  <span className="cashbook-field-label">{si ? 'ගෙවූ / ලැබුණු ගිණුම' : 'Account'}</span>
                  <LiquidTiles value={payCodeSelected} onChange={setPayCodeSelected} />
                </div>
              ) : null}

              {/* Details toggle — less common fields (guide §5.4) */}
              <button
                type="button"
                className="cb-details-toggle"
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails
                  ? si
                    ? '▲ අඩු විස්තර'
                    : '▲ Fewer details'
                  : si
                    ? '▼ වැඩි විස්තර (දිනය, විස්තරය)'
                    : '▼ More details (date, note)'}
              </button>

              {showDetails || mode === 'invoice' || mode === 'bill' || mode === 'move_money' ? (
                <>
                  {mode !== 'move_money' ? (
                    <label className="cb-field">
                      <span>{gloss('description', si)}</span>
                      <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={si ? 'කෙටි සටහන' : 'Short note'}
                      />
                    </label>
                  ) : (
                    <label className="cb-field">
                      <span>{si ? 'සටහන' : 'Note'}</span>
                      <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={si ? 'උදා: ATM' : 'e.g. ATM'}
                      />
                    </label>
                  )}
                  <DateField label={gloss('date', si)} value={date} onChange={setDate} />
                  {mode === 'invoice' || mode === 'bill' ? (
                    <DateField
                      label={si ? 'ගෙවිය යුතු දිනය' : 'Due date (optional)'}
                      value={dueDate || date}
                      onChange={setDueDate}
                    />
                  ) : null}
                </>
              ) : null}

              {error ? <p className="cashbook-error">{error}</p> : null}

              <button type="button" className="cashbook-save cb-sheet-save" disabled={pending} onClick={submit}>
                {pending ? <Loader2 className="spin" size={20} /> : null}
                <span className={si ? 'si-text' : undefined}>{gloss('save', si)}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </CashbookShell>
  );
}
