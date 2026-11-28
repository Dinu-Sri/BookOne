import { describe, expect, it } from 'vitest';
import { assertLinesBalanceExactly, centsToString, sideTotalsCents, toCents } from '../src/money';

describe('toCents', () => {
  it('parses strings and numbers with up to 2 decimals exactly', () => {
    expect(toCents('0')).toBe(0n);
    expect(toCents('12')).toBe(1200n);
    expect(toCents('12.3')).toBe(1230n);
    expect(toCents('12.34')).toBe(1234n);
    expect(toCents('-0.01')).toBe(-1n);
    expect(toCents('1234567890123.45')).toBe(123456789012345n);
    expect(toCents(12.34)).toBe(1234n);
    expect(toCents(0.3)).toBe(30n);
    expect(toCents(-7)).toBe(-700n);
  });

  it('accepts trailing zeros past 2 decimals (numeric(18,4) columns) but never a third significant decimal', () => {
    expect(toCents('12.3400')).toBe(1234n);
    expect(() => toCents('12.345')).toThrow();
    expect(() => toCents('0.001')).toThrow();
  });

  it('rejects floats that are not exact 2-decimal values', () => {
    expect(() => toCents(0.1 + 0.2)).toThrow();
    expect(() => toCents(33.333)).toThrow();
  });

  it('rejects NaN, Infinity, exponents and junk', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e21, 1e-7]) {
      expect(() => toCents(bad)).toThrow();
    }
    for (const bad of ['', ' ', 'NaN', 'Infinity', '1e3', '1,000.00', '12.', '.5', '+5', '--1', '12.3.4', '0x10']) {
      expect(() => toCents(bad)).toThrow();
    }
  });
});

describe('centsToString', () => {
  it('formats with exactly 2 decimals', () => {
    expect(centsToString(0n)).toBe('0.00');
    expect(centsToString(5n)).toBe('0.05');
    expect(centsToString(1234n)).toBe('12.34');
    expect(centsToString(-1n)).toBe('-0.01');
    expect(centsToString(-123456n)).toBe('-1234.56');
  });
  it('round-trips', () => {
    for (const s of ['0.00', '0.07', '19.90', '-3.50', '999999999.99']) expect(centsToString(toCents(s))).toBe(s);
  });
});

describe('exact balance', () => {
  it('sums sides in cents', () => {
    const t = sideTotalsCents([
      { side: 'debit', amount: 0.1 },
      { side: 'debit', amount: 0.2 },
      { side: 'credit', amount: '0.30' },
    ]);
    expect(t).toEqual({ debit: 30n, credit: 30n });
  });
  it('refuses a one-cent difference (no tolerance)', () => {
    expect(() =>
      assertLinesBalanceExactly([
        { side: 'debit', amount: '100.00' },
        { side: 'credit', amount: '99.99' },
      ]),
    ).toThrow(/not balanced/i);
  });
  it('refuses a sub-cent line that the old 0.005 tolerance accepted', () => {
    // Old check: |100.004 - 100.00| < 0.005 → "balanced", but numeric(18,2) stores 100.00 vs 100.00 only by luck.
    expect(() =>
      assertLinesBalanceExactly([
        { side: 'debit', amount: 100.004 },
        { side: 'credit', amount: 100 },
      ]),
    ).toThrow();
  });
  it('accepts an exactly balanced entry and returns its total', () => {
    expect(
      assertLinesBalanceExactly([
        { side: 'debit', amount: '60.10' },
        { side: 'debit', amount: 39.9 },
        { side: 'credit', amount: '100' },
      ]),
    ).toBe(10000n);
  });
});
