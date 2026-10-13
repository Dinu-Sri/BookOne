import { describe, expect, it } from 'vitest';
import { signedCashFlow } from '../src/cash-flow';

describe('signedCashFlow', () => {
  it('nets a cash sale and its reversal to zero in the same set', () => {
    const flow = signedCashFlow([
      { accountCode: '1000', side: 'debit', amount: 123.45 },
      { accountCode: '4000', side: 'credit', amount: 123.45 },
      { accountCode: '1000', side: 'credit', amount: 123.45 },
      { accountCode: '4000', side: 'debit', amount: 123.45 },
    ]);
    expect(flow.moneyIn).toBe(123.45);
    expect(flow.moneyOut).toBe(123.45);
    expect(flow.net).toBe(0);
    expect(flow.lineCount).toBe(2);
  });

  it('keeps original and reversal in different sets as period movement', () => {
    const october = signedCashFlow([{ accountCode: '1000', side: 'debit', amount: 123.45 }]);
    const november = signedCashFlow([{ accountCode: '1000', side: 'credit', amount: 123.45 }]);
    expect(october.net).toBe(123.45);
    expect(november.net).toBe(-123.45);
  });

  it('nets an internal cash-to-bank transfer to zero', () => {
    const flow = signedCashFlow([
      { accountCode: '1000', side: 'credit', amount: 50 },
      { accountCode: '1100', side: 'debit', amount: 50 },
    ]);
    expect(flow.moneyIn).toBe(50);
    expect(flow.moneyOut).toBe(50);
    expect(flow.net).toBe(0);
  });

  it('ignores non-cash invoice lines', () => {
    const flow = signedCashFlow([
      { accountCode: '1300', side: 'debit', amount: 100 },
      { accountCode: '4000', side: 'credit', amount: 100 },
    ]);
    expect(flow).toEqual({ moneyIn: 0, moneyOut: 0, net: 0, lineCount: 0 });
  });

  it('counts a reversed expense as money out then money in', () => {
    const flow = signedCashFlow([
      { accountCode: '1100', side: 'credit', amount: 12.34 },
      { accountCode: '6000', side: 'debit', amount: 12.34 },
      { accountCode: '1100', side: 'debit', amount: 12.34 },
      { accountCode: '6000', side: 'credit', amount: 12.34 },
    ]);
    expect(flow.moneyIn).toBe(12.34);
    expect(flow.moneyOut).toBe(12.34);
    expect(flow.net).toBe(0);
  });
});
