import { describe, expect, it } from 'vitest';
import {
  cashUniverseFromRows,
  classifyCashJournal,
  externalCashFlow,
  rowsFromLines,
  spendableCashFromRows,
} from '../src/dashboard-metrics';
import { signedCashFlow } from '../src/cash-flow';

describe('COA-01 Pilot-01 bank regressions', () => {
  it('Dr custom bank 1101 = 300 / Cr equity 3000 = 300 is cash and bank 300', () => {
    const rows = rowsFromLines([
      {
        journalId: 'j1',
        date: '2026-01-15',
        accountCode: '1101',
        accountType: 'asset',
        side: 'debit',
        amount: 300,
      },
      {
        journalId: 'j1',
        date: '2026-01-15',
        accountCode: '3000',
        accountType: 'equity',
        side: 'credit',
        amount: 300,
      },
    ]);
    expect(spendableCashFromRows(rows)).toBe(300);
    expect(cashUniverseFromRows(rows)).toBe(300);
  });

  it('Cr 1100 / Dr 1101 in one journal is an internal transfer, not an external outflow', () => {
    const lines = [
      {
        journalId: 'xfer',
        date: '2026-01-16',
        accountCode: '1100',
        accountType: 'asset',
        side: 'credit',
        amount: 100,
      },
      {
        journalId: 'xfer',
        date: '2026-01-16',
        accountCode: '1101',
        accountType: 'asset',
        side: 'debit',
        amount: 100,
      },
    ];
    expect(classifyCashJournal(lines)).toBe('internal_transfer');
    const flow = externalCashFlow(lines);
    expect(flow.moneyOut).toBe(0);
    expect(flow.moneyIn).toBe(0);
    expect(flow.transferIn).toBe(100);
    expect(flow.transferOut).toBe(100);
    expect(signedCashFlow(lines).net).toBe(0);
  });

  it('cash to custom bank and reverse custom-to-custom stay internal', () => {
    expect(
      classifyCashJournal([
        { accountCode: '1000', side: 'credit', amount: 50 },
        { accountCode: '1101', side: 'debit', amount: 50 },
      ]),
    ).toBe('internal_transfer');
    expect(
      classifyCashJournal([
        { accountCode: '1101', side: 'credit', amount: 40 },
        { accountCode: '1102', side: 'debit', amount: 40 },
      ]),
    ).toBe('internal_transfer');
  });
});
