import { readFileSync } from 'node:fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { finishEligibility } from '../../statement-import/src/finish-eligibility';
import {
  independentBankReconOracle,
  loadBankReconFixture,
} from '../../../scripts/coreguard/fixture';

const fixture = loadBankReconFixture();

describe('bank-recon independent oracle', () => {
  it('keeps integer-cent expected values independent of production cash helpers', () => {
    const oracle = independentBankReconOracle(fixture);
    expect(fixture.opening.debitCents).toBe(100_000);
    expect(fixture.matching.map((row) => row.amountCents)).toEqual([50_000, 20_000, 12_500]);
    expect(fixture.bookOnly.amountCents).toBe(6_000);
    expect(fixture.fee.amountCents).toBe(2_500);
    expect(oracle.afterSeed).toEqual({ bank: 148_500, journals: 5 });
    expect(oracle.afterImportMatch).toEqual({ bank: 148_500, journals: 5 });
    expect(oracle.afterFeeAndWaiting).toEqual({
      bank: 146_000,
      journals: 6,
      outstanding: 6_000,
      difference: 0,
    });
    expect(oracle.statement).toEqual({
      opening: 100_000,
      moneyIn: 62_500,
      moneyOut: 22_500,
      closing: 140_000,
    });
    expect(oracle.statement.opening + oracle.statement.moneyIn - oracle.statement.moneyOut).toBe(
      oracle.statement.closing,
    );
    expect(oracle.afterFeeAndWaiting.bank - oracle.afterFeeAndWaiting.outstanding).toBe(
      oracle.statement.closing,
    );
  });

  it('allows finish only after the 60 deposit is waiting and the fee is posted', () => {
    const open = finishEligibility({
      openCases: [
        { caseType: 'match_1_1', state: 'suggested' },
        { caseType: 'match_1_1', state: 'suggested' },
        { caseType: 'match_1_1', state: 'suggested' },
        { caseType: 'create_entry', state: 'needs_review' },
        { caseType: 'outstanding_book', state: 'suggested' },
      ],
      bankClose: 1400,
      bookClose: 1485,
      outstandingNet: 0,
    });
    expect(open.ok).toBe(false);
    const ready = finishEligibility({
      openCases: [{ caseType: 'outstanding_book', state: 'confirmed' }],
      bankClose: 1400,
      bookClose: 1460,
      outstandingNet: 60,
    });
    expect(ready.ok).toBe(true);
    expect(ready.difference).toBe(0);
  });

  it('pins the versioned fixture file', () => {
    const raw = readFileSync(path.resolve(__dirname, '../../../docs/coreguard/fixtures/bank-recon.v1.json'), 'utf8');
    expect(raw).toMatch(/"version": 1/);
    expect(raw).toMatch(/"code": "1102"/);
    expect(raw).toMatch(/"bookCloseCents": 146000/);
    expect(raw).toMatch(/qa-statement-clean.csv/);
  });
});
