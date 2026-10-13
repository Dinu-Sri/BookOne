function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Statement (P&L / balance-sheet) signed amount from journal totals.
 * Assets and expenses: debit − credit.
 * Liabilities, equity and revenue: credit − debit (contra revenue such as 4100 is negative).
 */
export function signedAccountBalance(type: string, debit: number, credit: number): number {
  const d = Number.isFinite(debit) ? debit : 0;
  const c = Number.isFinite(credit) ? credit : 0;
  if (type === 'asset' || type === 'expense') return roundMoney(d - c);
  return roundMoney(c - d);
}
