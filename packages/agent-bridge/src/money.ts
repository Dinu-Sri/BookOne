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

export type ParsedMinor =
  | { ok: true; minor: number }
  | { ok: false; code: 'INVALID_AMOUNT'; error: string };

/** Exact decimal → integer minor units. Never coerce invalid input to 0. */
export function parseMajorToMinor(raw: string, scale = MONEY_SCALE): ParsedMinor {
  const text = raw.trim();
  if (!text) return { ok: false, code: 'INVALID_AMOUNT', error: 'Amount is required.' };
  if (/^-?\d+\.\d{3,}$/.test(text)) {
    return { ok: false, code: 'INVALID_AMOUNT', error: 'Use at most two decimal places.' };
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) {
    return { ok: false, code: 'INVALID_AMOUNT', error: 'Amount must be an exact decimal.' };
  }
  const n = Number(text);
  if (!Number.isFinite(n)) {
    return { ok: false, code: 'INVALID_AMOUNT', error: 'Amount must be an exact decimal.' };
  }
  if (n < 0) return { ok: false, code: 'INVALID_AMOUNT', error: 'Amount cannot be negative.' };
  return { ok: true, minor: Math.round(n * 10 ** scale) };
}
