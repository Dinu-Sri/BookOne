/**
 * Exact money (CoreGuard guide §4.1, D3): amounts are integer cents as `bigint`. Debits equal credits exactly,
 * with no tolerance. A value with a third significant decimal is refused, never rounded, because the database
 * column (numeric(18,2)) would otherwise round each line on its own and could store an unbalanced entry.
 */

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/** Parse a money amount into integer cents. Rejects NaN, Infinity, exponents, junk and more than 2 decimals. */
export function toCents(value: string | number): bigint {
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Amount ${value} is not a finite number.`);
    // Shortest round-trip form: 12.34 → "12.34", 0.1 + 0.2 → "0.30000000000000004" (refused below).
    text = String(value);
  } else if (typeof value === 'string') {
    text = value;
  } else {
    throw new Error('Amount must be a string or a number.');
  }
  const match = DECIMAL.exec(text);
  if (!match) throw new Error(`Amount "${text}" is not a plain decimal number.`);
  const [, minus, whole, rawFraction = ''] = match;
  const fraction = rawFraction.replace(/0+$/, '');
  if (fraction.length > 2) throw new Error(`Amount "${text}" has more than 2 decimals.`);
  const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
  return minus ? -cents : cents;
}

/** Format cents as a plain decimal string with exactly 2 decimals ("-12.34"). */
export function centsToString(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

/** Cents as a JS number of currency units, for display/legacy callers only (exact for |value| < 2^53 cents). */
export function centsToNumber(cents: bigint): number {
  return Number(centsToString(cents));
}

export type MoneyLine = { side: 'debit' | 'credit' | string; amount: string | number };

/** Σdebits and Σcredits in exact cents. Every line amount must itself be an exact 2-decimal value. */
export function sideTotalsCents(lines: readonly MoneyLine[]): { debit: bigint; credit: bigint } {
  let debit = 0n;
  let credit = 0n;
  for (const line of lines) {
    const cents = toCents(line.amount);
    if (line.side === 'debit') debit += cents;
    else if (line.side === 'credit') credit += cents;
    else throw new Error(`Journal line side "${line.side}" is not debit or credit.`);
  }
  return { debit, credit };
}

/** Throw unless Σdebits === Σcredits exactly. Returns the entry total in cents. */
export function assertLinesBalanceExactly(lines: readonly MoneyLine[]): bigint {
  const { debit, credit } = sideTotalsCents(lines);
  if (debit !== credit) {
    throw new Error(
      `Journal is not balanced (debits ${centsToString(debit)}, credits ${centsToString(credit)}).`,
    );
  }
  return debit;
}
