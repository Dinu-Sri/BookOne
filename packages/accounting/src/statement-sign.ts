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

export type StatementRow = {
  accountCode: string;
  accountName: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
};

export const CURRENT_EARNINGS_CODE = 'current_earnings';
export const CURRENT_EARNINGS_NAME = 'Current earnings';

/**
 * Balance sheet equity is posted capital/drawings/retained earnings only.
 * Unclosed P&L (netIncome) is a presentation line so assets = liabilities + equity
 * without rewriting journals. Closed books have netIncome 0, so retained earnings
 * are not double-counted (BUG-0048 / RT-060).
 */
export function withUnclosedEarnings(
  equity: StatementRow[],
  netIncome: number,
): { equity: StatementRow[]; totalEquity: number } {
  const ni = roundMoney(netIncome);
  const rows = [...equity];
  if (Math.abs(ni) >= 0.005) {
    rows.push({
      accountCode: CURRENT_EARNINGS_CODE,
      accountName: CURRENT_EARNINGS_NAME,
      type: 'equity',
      debit: ni < 0 ? roundMoney(-ni) : 0,
      credit: ni > 0 ? ni : 0,
      balance: ni,
    });
  }
  const totalEquity = roundMoney(rows.reduce((sum, row) => sum + row.balance, 0));
  return { equity: rows, totalEquity };
}
