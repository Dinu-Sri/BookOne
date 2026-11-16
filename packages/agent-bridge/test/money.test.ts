import { describe, expect, it } from 'vitest';
import { addMinor, money, percentOfMinor } from '../src/money';

describe('money protocol', () => {
  it('rejects non-integer minor units', () => {
    expect(() => money(1.5)).toThrow(/integer/);
  });

  it('rounds VAT half-up independently of production helpers', () => {
    expect(percentOfMinor(999, 18)).toBe(180);
    expect(percentOfMinor(100000, 18)).toBe(18000);
    expect(addMinor(100000, 18000)).toBe(118000);
  });
});
