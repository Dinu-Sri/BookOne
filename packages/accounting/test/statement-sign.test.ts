import { describe, expect, it } from 'vitest';
import {
  CURRENT_EARNINGS_CODE,
  signedAccountBalance,
  withUnclosedEarnings,
} from '../src/statement-sign';

describe('signedAccountBalance', () => {
  it('nets sales revenue minus sales returns', () => {
    expect(signedAccountBalance('revenue', 0, 600)).toBe(600);
    expect(signedAccountBalance('revenue', 100, 0)).toBe(-100);
    expect(signedAccountBalance('revenue', 0, 600) + signedAccountBalance('revenue', 100, 0)).toBe(500);
  });

  it('keeps cash and AR as debit-minus-credit assets', () => {
    expect(signedAccountBalance('asset', 250, 0)).toBe(250);
    expect(signedAccountBalance('asset', 600, 350)).toBe(250);
  });

  it('treats drawings as a reduction of equity', () => {
    expect(signedAccountBalance('equity', 0, 1000)).toBe(1000);
    expect(signedAccountBalance('equity', 100, 0)).toBe(-100);
  });
});

describe('withUnclosedEarnings (BUG-0048)', () => {
  const ownerEquity = {
    accountCode: '3000',
    accountName: 'Owner Equity',
    type: 'equity',
    debit: 0,
    credit: 1000,
    balance: 1000,
  };

  it('adds current profit so liabilities plus equity equal assets', () => {
    const { equity, totalEquity } = withUnclosedEarnings([ownerEquity], 120);
    expect(totalEquity).toBe(1120);
    expect(equity.find((r) => r.accountCode === CURRENT_EARNINGS_CODE)?.balance).toBe(120);
    expect(400 + totalEquity).toBe(1520);
  });

  it('uses profit as equity when capital is still zero (RT-060)', () => {
    const { totalEquity, equity } = withUnclosedEarnings([], 600);
    expect(totalEquity).toBe(600);
    expect(equity).toHaveLength(1);
    expect(equity[0]?.balance).toBe(600);
  });

  it('does not add a current-earnings row when net income is zero', () => {
    const retained = {
      accountCode: '3000',
      accountName: 'Owner Equity',
      type: 'equity',
      debit: 0,
      credit: 600,
      balance: 600,
    };
    const { equity, totalEquity } = withUnclosedEarnings([retained], 0);
    expect(totalEquity).toBe(600);
    expect(equity.some((r) => r.accountCode === CURRENT_EARNINGS_CODE)).toBe(false);
  });

  it('reduces equity for an unclosed loss', () => {
    const { totalEquity } = withUnclosedEarnings([ownerEquity], -80);
    expect(totalEquity).toBe(920);
  });
});
