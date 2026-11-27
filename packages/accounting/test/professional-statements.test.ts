import { describe, expect, it } from 'vitest';
import {
  comparativeRange,
  statementOfCashFlows,
  statementOfChangesInEquity,
  statementOfFinancialPosition,
  statementOfProfitOrLoss,
  type CashJournalLine,
  type StatementAccount,
} from '../src/professional-statements';

const A = (code: string, name: string, type: string, debit: number, credit: number, extra: Partial<StatementAccount> = {}): StatementAccount => ({
  code,
  name,
  type,
  debit,
  credit,
  ...extra,
});

// A small trading year: capital 500k, sales 400k (cost 240k), expenses, a loan, equipment.
const closing: StatementAccount[] = [
  A('1000', 'Cash on Hand', 'asset', 50000, 20000, { subtype: 'cash', liquidity: 'cash' }),
  A('1100', 'Commercial Bank', 'asset', 1048000, 520000, { subtype: 'bank', liquidity: 'bank' }),
  A('1300', 'Accounts Receivable', 'asset', 120000, 80000, { subtype: 'receivable', controlRole: 'ar' }),
  A('5100', 'Inventory', 'asset', 300000, 240000, { subtype: 'inventory' }),
  A('1500', 'Office Equipment', 'asset', 150000, 0),
  A('2100', 'Accounts Payable', 'liability', 200000, 260000, { subtype: 'payable', controlRole: 'ap' }),
  A('2200', 'Output VAT', 'liability', 0, 18000, { subtype: 'tax', controlRole: 'vat_output' }),
  A('2600', 'Long-term Bank Loan', 'liability', 20000, 200000),
  A('3000', 'Owner Equity', 'equity', 0, 500000, { subtype: 'equity' }),
  A('3100', 'Owner Drawings', 'equity', 30000, 0),
  A('4000', 'Sales Revenue', 'revenue', 0, 410000, { subtype: 'sales' }),
  A('4100', 'Sales Returns', 'revenue', 10000, 0, { subtype: 'sales_return' }),
  A('4300', 'Other Income', 'revenue', 0, 5000, { subtype: 'other_income' }),
  A('5000', 'Cost of Goods Sold', 'expense', 240000, 0, { subtype: 'cogs' }),
  A('6000', 'Marketing Expense', 'expense', 15000, 0),
  A('6100', 'Rent Expense', 'expense', 60000, 0),
  A('6600', 'Bank Charges', 'expense', 2000, 0),
  A('6900', 'Loan Interest', 'expense', 8000, 0),
];

describe('Statement of Profit or Loss (by function)', () => {
  const pl = statementOfProfitOrLoss(closing);
  const v = (k: string) => pl.lines.find((l) => l.key === k)!.amount;
  it('groups revenue, cost of sales, other income, distribution, admin and finance costs', () => {
    expect(v('revenue')).toBe(400000);
    expect(v('cost_of_sales')).toBe(240000);
    expect(v('gross_profit')).toBe(160000);
    expect(v('other_income')).toBe(5000);
    expect(v('distribution')).toBe(15000);
    expect(v('administrative')).toBe(60000);
    expect(v('operating_profit')).toBe(90000);
    expect(v('finance_costs')).toBe(10000);
    expect(v('profit_for_period')).toBe(80000);
    expect(pl.checks.every((c) => c.ok)).toBe(true);
  });
  it('shows a comparative column', () => {
    const prior = closing.map((a) => ({ ...a, debit: a.debit / 2, credit: a.credit / 2 }));
    const cmp = statementOfProfitOrLoss(closing, prior);
    expect(cmp.lines.find((l) => l.key === 'profit_for_period')!.compare).toBe(40000);
  });
});

describe('Statement of Financial Position', () => {
  const fp = statementOfFinancialPosition(closing);
  const v = (k: string) => fp.lines.find((l) => l.key === k)?.amount ?? 0;
  it('splits current and non-current, and balances with unclosed profit in retained earnings', () => {
    expect(v('ppe')).toBe(150000);
    expect(v('inventories')).toBe(60000);
    expect(v('receivables')).toBe(40000);
    expect(v('cash')).toBe(558000);
    expect(v('total_assets')).toBe(808000);
    expect(v('non_current_borrowings')).toBe(180000);
    expect(v('payables')).toBe(60000);
    expect(v('tax_liabilities')).toBe(18000);
    expect(v('retained_earnings')).toBe(80000);
    expect(v('drawings')).toBe(-30000);
    expect(v('total_equity')).toBe(550000);
    expect(v('total_equity_and_liabilities')).toBe(808000);
    expect(fp.checks[0]!.ok).toBe(true);
  });
});

describe('Statement of Cash Flows (direct)', () => {
  const acc = (code: string) => {
    const a = closing.find((x) => x.code === code)!;
    return { code: a.code, name: a.name, type: a.type, subtype: a.subtype, controlRole: a.controlRole, liquidity: a.liquidity };
  };
  const lines: CashJournalLine[] = [
    { entryId: 'e1', account: acc('1100'), side: 'debit', amount: 500000 },
    { entryId: 'e1', account: acc('3000'), side: 'credit', amount: 500000 },
    { entryId: 'e2', account: acc('1100'), side: 'debit', amount: 100000 },
    { entryId: 'e2', account: acc('4000'), side: 'credit', amount: 100000 },
    { entryId: 'e3', account: acc('6100'), side: 'debit', amount: 60000 },
    { entryId: 'e3', account: acc('1100'), side: 'credit', amount: 60000 },
    { entryId: 'e4', account: acc('1500'), side: 'debit', amount: 150000 },
    { entryId: 'e4', account: acc('1100'), side: 'credit', amount: 150000 },
    { entryId: 'e5', account: acc('1000'), side: 'debit', amount: 20000 },
    { entryId: 'e5', account: acc('1100'), side: 'credit', amount: 20000 },
    { entryId: 'e6', account: acc('3100'), side: 'debit', amount: 30000 },
    { entryId: 'e6', account: acc('1000'), side: 'credit', amount: 30000 },
  ];
  const cf = statementOfCashFlows({ lines, openingCash: 0, closingCash: 360000 });
  const v = (k: string) => cf.lines.find((l) => l.key === k)?.amount ?? 0;
  it('classifies by activity, ignores transfers between cash accounts and reconciles closing cash', () => {
    expect(v('receipts_customers')).toBe(100000);
    expect(v('payments_suppliers_employees')).toBe(-60000);
    expect(v('ppe')).toBe(-150000);
    expect(v('capital')).toBe(500000);
    expect(v('drawings')).toBe(-30000);
    expect(v('net_change')).toBe(360000);
    expect(v('closing_cash')).toBe(360000);
    expect(cf.checks[0]!.ok).toBe(true);
  });
});

describe('Statement of Changes in Equity', () => {
  it('rolls opening equity forward by profit, capital and drawings', () => {
    const opening = closing.map((a) =>
      a.type === 'equity' ? { ...a, debit: 0, credit: a.code === '3000' ? 300000 : 0 } : { ...a, debit: 0, credit: 0 },
    );
    const s = statementOfChangesInEquity({ opening, closing, periodProfit: 80000 });
    const v = (k: string) => s.lines.find((l) => l.key === k)!.amount;
    expect(v('opening')).toBe(300000);
    expect(v('capital')).toBe(200000);
    expect(v('drawings')).toBe(-30000);
    expect(v('closing')).toBe(550000);
    expect(s.checks[0]!.ok).toBe(true);
  });
});

describe('comparative period', () => {
  it('uses the previous month, previous year or the same length before', () => {
    expect(comparativeRange('2026-11-01', '2026-11-30')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(comparativeRange('2026-04-01', '2027-03-31')).toEqual({ from: '2025-04-01', to: '2026-03-31' });
    expect(comparativeRange('2026-11-10', '2026-11-19')).toEqual({ from: '2026-10-31', to: '2026-11-09' });
    expect(comparativeRange(null, null)).toBeNull();
  });
});
