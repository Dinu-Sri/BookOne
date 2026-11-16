/** Protocol money is integer minor units. Never use binary floats in contracts. */

export const MONEY_SCALE = 2;
export const DEFAULT_CURRENCY = 'LKR';

export type Money = {
  currency: string;
  minor: number;
  scale: number;
};

export function money(minor: number, currency = DEFAULT_CURRENCY, scale = MONEY_SCALE): Money {
  if (!Number.isInteger(minor)) throw new Error('Money minor units must be an integer.');
  return { currency, minor, scale };
}

export function minorToMajor(m: Money): number {
  const div = 10 ** m.scale;
  return m.minor / div;
}

/** Independent oracle rounding: half-up on the last remaining minor unit. */
export function percentOfMinor(minor: number, ratePercent: number): number {
  if (!Number.isFinite(ratePercent) || ratePercent < 0) return 0;
  return Math.round((minor * ratePercent) / 100);
}

export function addMinor(...parts: number[]): number {
  return parts.reduce((s, n) => s + n, 0);
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency || a.scale !== b.scale) {
    throw new Error('Currency or scale mismatch.');
  }
}
