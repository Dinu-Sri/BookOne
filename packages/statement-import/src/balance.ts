import type { CanonicalStatementLine } from './types';

export type ContinuityFlag = 'BALANCE_BREAK' | 'BALANCE_OK' | 'BALANCE_UNKNOWN';

/**
 * Flag running-balance discontinuities when balance_after is present on consecutive lines.
 * Lines are ordered by date then rowNumber (statement chronological).
 */
export function annotateBalanceContinuity(
  lines: CanonicalStatementLine[],
): Map<number, ContinuityFlag> {
  const flags = new Map<number, ContinuityFlag>();
  const ordered = [...lines].sort(
    (a, b) => a.date.localeCompare(b.date) || a.rowNumber - b.rowNumber,
  );

  let prev: CanonicalStatementLine | null = null;
  for (const line of ordered) {
    if (line.balanceAfter == null || !Number.isFinite(line.balanceAfter)) {
      flags.set(line.rowNumber, 'BALANCE_UNKNOWN');
      prev = line;
      continue;
    }
    if (
      !prev ||
      prev.balanceAfter == null ||
      !Number.isFinite(prev.balanceAfter)
    ) {
      flags.set(line.rowNumber, 'BALANCE_OK');
      prev = line;
      continue;
    }
    // Bank: next balance ≈ prev balance + this line amount (signed in = +)
    const expected = Math.round((prev.balanceAfter + line.amountSigned) * 100) / 100;
    const actual = Math.round(line.balanceAfter * 100) / 100;
    if (Math.abs(expected - actual) > 0.05) {
      flags.set(line.rowNumber, 'BALANCE_BREAK');
    } else {
      flags.set(line.rowNumber, 'BALANCE_OK');
    }
    prev = line;
  }
  return flags;
}
