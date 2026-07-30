/**
 * Statement-level balance equation (studio gate).
 * opening + money_in - money_out = closing
 */

export type StatementTotals = {
  openingBalance: number | null;
  closingBalance: number | null;
  totalMoneyIn: number;
  totalMoneyOut: number;
  transactionCount: number;
};

export type BalanceCheckResult = {
  ok: boolean;
  expectedClosing: number | null;
  difference: number | null;
  message: string;
};

export function checkStatementBalance(
  totals: StatementTotals,
  tolerance = 0.005,
): BalanceCheckResult {
  if (totals.openingBalance == null || totals.closingBalance == null) {
    return {
      ok: true,
      expectedClosing: null,
      difference: null,
      message: 'Opening or closing balance not available — equation skipped.',
    };
  }
  const expected =
    Math.round(
      (totals.openingBalance + totals.totalMoneyIn - totals.totalMoneyOut) * 100,
    ) / 100;
  const diff = Math.round((expected - totals.closingBalance) * 100) / 100;
  if (Math.abs(diff) <= tolerance) {
    return {
      ok: true,
      expectedClosing: expected,
      difference: 0,
      message: 'Statement totals match.',
    };
  }
  return {
    ok: false,
    expectedClosing: expected,
    difference: diff,
    message: `Statement does not balance yet (difference Rs. ${Math.abs(diff).toFixed(2)}). Money In/Out may be reversed, or a row was skipped.`,
  };
}

/** Sum from signed amounts: + in, - out */
export function totalsFromSignedAmounts(
  amounts: number[],
  opening: number | null = null,
  closing: number | null = null,
): StatementTotals {
  let totalMoneyIn = 0;
  let totalMoneyOut = 0;
  for (const a of amounts) {
    if (a > 0.004) totalMoneyIn += a;
    else if (a < -0.004) totalMoneyOut += Math.abs(a);
  }
  return {
    openingBalance: opening,
    closingBalance: closing,
    totalMoneyIn: Math.round(totalMoneyIn * 100) / 100,
    totalMoneyOut: Math.round(totalMoneyOut * 100) / 100,
    transactionCount: amounts.filter((a) => Math.abs(a) > 0.004).length,
  };
}
