import { describe, expect, it } from 'vitest';
import {
  COA01_ADVANCE_EXAMPLES,
  TAXABLE_ADVANCE_REFUSAL,
  advanceOutstanding,
  canApplyAdvance,
  cashNetFromLines,
  customerAdvanceApplyLines,
  customerAdvanceIssueLines,
  linesBalance,
  staffAdvanceExpenseLines,
  staffAdvanceIssueLines,
  staffAdvanceReturnLines,
  supplierAdvanceApplyLines,
  supplierAdvanceIssueLines,
} from '../src/advances';

describe('COA-01 advance mechanics (non-VAT)', () => {
  it('customer: receive 1000, apply 400, remaining 600 with no extra revenue', () => {
    const issue = customerAdvanceIssueLines(COA01_ADVANCE_EXAMPLES.customer.issue);
    const apply = customerAdvanceApplyLines(COA01_ADVANCE_EXAMPLES.customer.apply);
    expect(linesBalance(issue)).toBe(true);
    expect(linesBalance(apply)).toBe(true);
    expect(apply.some((line) => line.accountCode === '4000')).toBe(false);
    const remaining = advanceOutstanding({
      kind: 'customer',
      issued: 1000,
      applied: 400,
      refunded: 0,
      expenseSettled: 0,
      returnedCash: 0,
    });
    expect(remaining).toBe(600);
    expect(canApplyAdvance({ kind: 'customer', issued: 1000, applied: 400, refunded: 0, expenseSettled: 0, returnedCash: 0 }, 700).ok).toBe(
      false,
    );
  });

  it('supplier: pay 1000, apply 400, remaining 600', () => {
    expect(linesBalance(supplierAdvanceIssueLines(1000))).toBe(true);
    expect(linesBalance(supplierAdvanceApplyLines(400))).toBe(true);
    expect(
      advanceOutstanding({ kind: 'supplier', issued: 1000, applied: 400, refunded: 0, expenseSettled: 0, returnedCash: 0 }),
    ).toBe(600);
  });

  it('staff: issue 1000, expense 400, return 100, remaining 500, cash net out 900', () => {
    const issue = staffAdvanceIssueLines(1000);
    const expense = staffAdvanceExpenseLines(400);
    const returned = staffAdvanceReturnLines(100);
    expect(linesBalance([...issue, ...expense, ...returned])).toBe(true);
    const remaining = advanceOutstanding({
      kind: 'staff',
      issued: 1000,
      applied: 0,
      refunded: 0,
      expenseSettled: 400,
      returnedCash: 100,
    });
    expect(remaining).toBe(500);
    const cashNet = cashNetFromLines([...issue, ...expense, ...returned], ['1000']);
    expect(cashNet).toBe(-900);
  });

  it('refuses taxable advances until a sourced VAT contract exists', () => {
    expect(TAXABLE_ADVANCE_REFUSAL).toMatch(/sourced VAT contract/i);
  });
});
