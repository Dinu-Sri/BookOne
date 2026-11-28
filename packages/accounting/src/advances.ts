/** Non-VAT advance mechanics. Taxable advances stay refused until a sourced contract exists. */

import { sideTotalsCents } from './money';

export type AdvanceKind = 'customer' | 'supplier' | 'staff';
export type AdvanceAllocationKind = 'apply' | 'refund' | 'expense_settle' | 'return_cash';

export type AdvanceState = {
  kind: AdvanceKind;
  issued: number;
  applied: number;
  refunded: number;
  expenseSettled: number;
  returnedCash: number;
};

export type JournalLineDraft = {
  accountCode: string;
  side: 'debit' | 'credit';
  amount: number;
  memo: string;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function moneyAmount(value: number): number {
  return roundMoney(Number(value) || 0);
}

export function advanceOutstanding(state: AdvanceState): number {
  return roundMoney(
    moneyAmount(state.issued) -
      moneyAmount(state.applied) -
      moneyAmount(state.refunded) -
      moneyAmount(state.expenseSettled) -
      moneyAmount(state.returnedCash),
  );
}

export function canApplyAdvance(
  state: AdvanceState,
  amount: number,
): { ok: true; remaining: number } | { ok: false; error: string } {
  const apply = moneyAmount(amount);
  if (apply <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
  const remaining = advanceOutstanding(state);
  if (apply > remaining + 0.005) {
    return { ok: false, error: 'Cannot apply more than the outstanding advance.' };
  }
  return { ok: true, remaining: roundMoney(remaining - apply) };
}

export const DEFAULT_ADVANCE_ACCOUNTS = {
  customer: '2410',
  supplier: '1350',
  staff: '1360',
  cash: '1000',
  ar: '1300',
  ap: '2100',
  expense: '6800',
} as const;

export function customerAdvanceIssueLines(amount: number, cashCode: string = DEFAULT_ADVANCE_ACCOUNTS.cash): JournalLineDraft[] {
  const n = moneyAmount(amount);
  return [
    { accountCode: cashCode, side: 'debit', amount: n, memo: 'Customer advance received' },
    { accountCode: DEFAULT_ADVANCE_ACCOUNTS.customer, side: 'credit', amount: n, memo: 'Customer advance liability' },
  ];
}

export function customerAdvanceApplyLines(amount: number): JournalLineDraft[] {
  const n = moneyAmount(amount);
  return [
    { accountCode: DEFAULT_ADVANCE_ACCOUNTS.customer, side: 'debit', amount: n, memo: 'Apply customer advance' },
    { accountCode: DEFAULT_ADVANCE_ACCOUNTS.ar, side: 'credit', amount: n, memo: 'Settle receivable from advance' },
  ];
}

export function customerAdvanceRefundLines(amount: number, cashCode: string = DEFAULT_ADVANCE_ACCOUNTS.cash): JournalLineDraft[] {
  const n = moneyAmount(amount);
  return [
    { accountCode: DEFAULT_ADVANCE_ACCOUNTS.customer, side: 'debit', amount: n, memo: 'Refund customer advance' },
    { accountCode: cashCode, side: 'credit', amount: n, memo: 'Customer advance refunded' },
  ];
}

export function supplierAdvanceIssueLines(amount: number, cashCode: string = DEFAULT_ADVANCE_ACCOUNTS.cash): JournalLineDraft[] {
  const n = moneyAmount(amount);
  return [
    { accountCode: DEFAULT_ADVANCE_ACCOUNTS.supplier, side: 'debit', amount: n, memo: 'Supplier advance paid' },
    { accountCode: cashCode, side: 'credit', amount: n, memo: 'Bank/cash for supplier advance' },
  ];
}

export function supplierAdvanceApplyLines(amount: number): JournalLineDraft[] {
  const n = moneyAmount(amount);
  return [
    { accountCode: DEFAULT_ADVANCE_ACCOUNTS.ap, side: 'debit', amount: n, memo: 'Settle payable from advance' },
    { accountCode: DEFAULT_ADVANCE_ACCOUNTS.supplier, side: 'credit', amount: n, memo: 'Apply supplier advance' },
  ];
}

export function supplierAdvanceRefundLines(amount: number, cashCode: string = DEFAULT_ADVANCE_ACCOUNTS.cash): JournalLineDraft[] {
  const n = moneyAmount(amount);
  return [
    { accountCode: cashCode, side: 'debit', amount: n, memo: 'Supplier advance returned' },
    { accountCode: DEFAULT_ADVANCE_ACCOUNTS.supplier, side: 'credit', amount: n, memo: 'Reduce supplier advance' },
  ];
}

export function staffAdvanceIssueLines(amount: number, cashCode: string = DEFAULT_ADVANCE_ACCOUNTS.cash): JournalLineDraft[] {
  const n = moneyAmount(amount);
  return [
    { accountCode: DEFAULT_ADVANCE_ACCOUNTS.staff, side: 'debit', amount: n, memo: 'Staff advance issued' },
    { accountCode: cashCode, side: 'credit', amount: n, memo: 'Bank/cash for staff advance' },
  ];
}

export function staffAdvanceExpenseLines(
  amount: number,
  expenseCode: string = DEFAULT_ADVANCE_ACCOUNTS.expense,
): JournalLineDraft[] {
  const n = moneyAmount(amount);
  return [
    { accountCode: expenseCode, side: 'debit', amount: n, memo: 'Approved staff expense settlement' },
    { accountCode: DEFAULT_ADVANCE_ACCOUNTS.staff, side: 'credit', amount: n, memo: 'Settle staff advance' },
  ];
}

export function staffAdvanceReturnLines(amount: number, cashCode: string = DEFAULT_ADVANCE_ACCOUNTS.cash): JournalLineDraft[] {
  const n = moneyAmount(amount);
  return [
    { accountCode: cashCode, side: 'debit', amount: n, memo: 'Unused staff advance returned' },
    { accountCode: DEFAULT_ADVANCE_ACCOUNTS.staff, side: 'credit', amount: n, memo: 'Reduce staff advance' },
  ];
}

/** Debits equal credits exactly, in integer cents (CoreGuard D3). A line that is not an exact 2-decimal amount fails. */
export function linesBalance(lines: JournalLineDraft[]): boolean {
  try {
    const { debit, credit } = sideTotalsCents(lines);
    return debit === credit;
  } catch {
    return false;
  }
}

export function cashNetFromLines(lines: JournalLineDraft[], cashCodes: Iterable<string>): number {
  const cash = new Set(cashCodes);
  let net = 0;
  for (const line of lines) {
    if (!cash.has(line.accountCode)) continue;
    net += line.side === 'debit' ? line.amount : -line.amount;
  }
  return roundMoney(net);
}

export const COA01_ADVANCE_EXAMPLES = {
  customer: { issue: 1000, apply: 400, remaining: 600 },
  supplier: { issue: 1000, apply: 400, remaining: 600 },
  staff: { issue: 1000, expense: 400, returned: 100, remaining: 500, cashNetOut: 900 },
} as const;

export const TAXABLE_ADVANCE_REFUSAL =
  'Taxable advances are not posted from this screen. Use a sourced VAT contract before receiving or applying a taxable advance.';
