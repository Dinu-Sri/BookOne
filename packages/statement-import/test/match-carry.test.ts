import { describe, expect, it } from 'vitest';
import { matchLine } from '../src/match';
import type { CanonicalStatementLine } from '../src/types';

function line(date: string, description: string, amountSigned: number, externalRef?: string): CanonicalStatementLine {
  return {
    rowNumber: 1,
    date,
    description,
    amountSigned,
    direction: amountSigned > 0 ? 'in' : 'out',
    fingerprint: `${date}${description}`,
    dateConfidence: 0.95,
    externalRef,
    raw: {},
  };
}

describe('matching across a few days and months', () => {
  it('a cheque cashed 2 days later is suggested when the cheque number matches', () => {
    const r = matchLine(line('2026-11-05', 'CHEQUE 001003 KANDY PROPERTIES', -60000, '001003'), [
      { id: 'rent', date: '2026-11-03', description: 'Office rent November cheque 001003', amountSigned: -60000 },
    ], { maxDayWindow: 7 });
    expect(r.proposedAction).toBe('review');
    expect(r.candidates[0]?.id).toBe('rent');
  });

  it('3+ days apart with nothing else in common is not suggested', () => {
    const r = matchLine(line('2026-11-02', 'DEPOSIT CASH BRANCH 042', 20000), [
      { id: 'dep', date: '2026-10-30', description: 'Shop cash sales banked end of month', amountSigned: 20000 },
    ], { maxDayWindow: 7 });
    expect(r.proposedAction).toBe('create');
  });

  it('last month\'s waiting deposit (boost) is suggested when it reaches the bank', () => {
    const r = matchLine(line('2026-11-02', 'DEPOSIT CASH BRANCH 042', 20000), [
      { id: 'dep', date: '2026-10-30', description: 'Shop cash sales banked end of month', amountSigned: 20000, boost: 0.15 },
    ], { maxDayWindow: 7 });
    expect(r.proposedAction).toBe('review');
    expect(r.candidates[0]?.id).toBe('dep');
  });

  it('default window stays 2 days for other callers', () => {
    const r = matchLine(line('2026-11-05', 'CHEQUE 001003', -60000, '001003'), [
      { id: 'rent', date: '2026-11-01', description: 'Rent cheque 001003', amountSigned: -60000 },
    ]);
    expect(r.candidates).toHaveLength(0);
  });
});
