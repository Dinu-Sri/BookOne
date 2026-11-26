import { describe, expect, it } from 'vitest';
import { composeFinancialStatements, type StatementRow } from '../src';

const row = (accountCode: string, type: StatementRow['type'], balance = 1): StatementRow => ({
  accountCode,
  accountName: accountCode,
  type,
  debit: balance > 0 ? balance : 0,
  credit: balance < 0 ? -balance : 0,
  balance,
});

describe('QA-1126-14 statement order', () => {
  it('lists balance sheet assets by account code', () => {
    const asOf = ['5100', '1360', '1000', '1101', '1200', '1300', '1350', '1100', '1400'].map((c) => row(c, 'asset'));
    const out = composeFinancialStatements([], asOf);
    expect(out.balanceSheet.assets.map((r) => r.accountCode)).toEqual([
      '1000', '1100', '1101', '1200', '1300', '1350', '1360', '1400', '5100',
    ]);
  });
});
