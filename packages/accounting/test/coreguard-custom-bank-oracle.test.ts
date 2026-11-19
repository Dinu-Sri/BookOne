import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  independentCustomBankOracle,
  loadCustomBankFixture,
} from '../../../scripts/coreguard/fixture';
import { classifyCashJournal } from '../src/dashboard-metrics';

const fixture = loadCustomBankFixture();

describe('custom-bank independent oracle', () => {
  it('keeps integer-cent expected values independent of production cash helpers', () => {
    const oracle = independentCustomBankOracle(fixture);
    expect(fixture.opening.debitCents).toBe(30_000);
    expect(fixture.transfer.amountCents).toBe(10_000);
    expect(oracle.afterCreate).toEqual({ custom: 0, owned: 0, spendable: 0 });
    expect(oracle.afterOpening).toEqual({ custom: 30_000, owned: 0, spendable: 30_000 });
    expect(oracle.afterTransfer).toEqual({
      custom: 20_000,
      owned: 10_000,
      spendable: 30_000,
      externalIn: 0,
      externalOut: 0,
    });
    expect(oracle.afterOpening.custom + oracle.afterOpening.owned).toBe(oracle.afterOpening.spendable);
    expect(oracle.afterTransfer.custom + oracle.afterTransfer.owned).toBe(oracle.afterTransfer.spendable);
  });

  it('classifies opening as funding and the 100 transfer as internal', () => {
    expect(
      classifyCashJournal([
        { accountCode: '1101', side: 'debit', amount: 300 },
        { accountCode: '3000', side: 'credit', amount: 300 },
      ]),
    ).toBe('funding');
    expect(
      classifyCashJournal([
        { accountCode: '1101', side: 'credit', amount: 100 },
        { accountCode: '1100', side: 'debit', amount: 100 },
      ]),
    ).toBe('internal_transfer');
  });

  it('pins the versioned fixture file', () => {
    const raw = readFileSync(path.resolve(__dirname, '../../../docs/coreguard/fixtures/custom-bank.v1.json'), 'utf8');
    expect(raw).toMatch(/"version": 1/);
    expect(raw).toMatch(/"code": "1101"/);
    expect(raw).toMatch(/"spendableCashCents": 30000/);
  });
});
