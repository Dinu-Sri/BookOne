import { describe, expect, it } from 'vitest';
import { parseAmountCell, parseStatementDate, signedFromDebitCredit } from '../src/normalize';
import { lineFingerprint } from '../src/fingerprint';
import { matchLine } from '../src/match';

describe('parseStatementDate SL bias', () => {
  it('parses ISO', () => {
    expect(parseStatementDate('2026-07-15').iso).toBe('2026-07-15');
  });

  it('prefers DD/MM when first part > 12', () => {
    const r = parseStatementDate('15/07/2026');
    expect(r.iso).toBe('2026-07-15');
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('prefers DD/MM when ambiguous', () => {
    const r = parseStatementDate('03/04/2026');
    expect(r.iso).toBe('2026-04-03'); // 3 April, not 4 March
  });
});

describe('parseAmountCell', () => {
  it('handles Rs and commas', () => {
    expect(parseAmountCell('Rs. 1,234.50')).toBe(1234.5);
  });
  it('handles parentheses negative', () => {
    expect(parseAmountCell('(500.00)')).toBe(-500);
  });
});

describe('signedFromDebitCredit', () => {
  it('credit - debit for typical SL bank', () => {
    expect(signedFromDebitCredit(100, 0)).toBe(-100);
    expect(signedFromDebitCredit(0, 250)).toBe(250);
  });
});

describe('fingerprint stable', () => {
  it('same inputs same hash', () => {
    const a = lineFingerprint({
      tenantId: 't1',
      bankAccountId: 'b1',
      date: '2026-07-01',
      amountSigned: -100,
      description: 'CEB  Bill',
    });
    const b = lineFingerprint({
      tenantId: 't1',
      bankAccountId: 'b1',
      date: '2026-07-01',
      amountSigned: -100,
      description: 'ceb bill',
    });
    expect(a).toBe(b);
  });
});

describe('matchLine', () => {
  it('auto-links exact date+amount unique', () => {
    const line = {
      rowNumber: 1,
      date: '2026-07-10',
      description: 'CEB electricity',
      amountSigned: -2500,
      direction: 'out' as const,
      fingerprint: 'x',
      dateConfidence: 1,
      raw: {},
    };
    const r = matchLine(line, [
      {
        id: 'tx1',
        date: '2026-07-10',
        description: 'CEB bill',
        amountSigned: -2500,
      },
    ]);
    expect(r.proposedAction).toBe('link');
    expect(r.matchedTransactionId).toBe('tx1');
  });
});

import { annotateBalanceContinuity } from '../src/balance';

describe('annotateBalanceContinuity', () => {
  it('flags broken running balance', () => {
    const flags = annotateBalanceContinuity([
      {
        rowNumber: 1,
        date: '2026-07-01',
        description: 'a',
        amountSigned: 100,
        direction: 'in',
        balanceAfter: 1000,
        fingerprint: '1',
        dateConfidence: 1,
        raw: {},
      },
      {
        rowNumber: 2,
        date: '2026-07-02',
        description: 'b',
        amountSigned: -50,
        direction: 'out',
        balanceAfter: 900, // should be 950
        fingerprint: '2',
        dateConfidence: 1,
        raw: {},
      },
    ]);
    expect(flags.get(2)).toBe('BALANCE_BREAK');
  });
});
