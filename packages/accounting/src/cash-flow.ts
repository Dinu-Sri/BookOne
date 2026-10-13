/** Cash / bank / card-clearing accounts used for cash-flow reporting. */
export const CASH_ACCOUNT_CODES = ['1000', '1100', '1200'] as const;

export type CashFlowLine = {
  accountCode: string;
  side: string;
  amount: number | string;
};

export type SignedCashFlow = {
  moneyIn: number;
  moneyOut: number;
  net: number;
  lineCount: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Signed cash movement from journal lines.
 * Debit to a cash/bank account is money in; credit is money out.
 * A sale and its reversing entry in the same set net to zero.
 * Internal cash↔bank transfers net to zero. Non-cash invoices contribute nothing.
 */
export function signedCashFlow(
  lines: CashFlowLine[],
  cashCodes: readonly string[] = CASH_ACCOUNT_CODES,
): SignedCashFlow {
  const cash = new Set(cashCodes);
  let moneyIn = 0;
  let moneyOut = 0;
  let lineCount = 0;
  for (const line of lines) {
    if (!cash.has(line.accountCode)) continue;
    const amount = Number(line.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    lineCount += 1;
    if (line.side === 'debit') moneyIn += amount;
    else if (line.side === 'credit') moneyOut += amount;
  }
  return {
    moneyIn: roundMoney(moneyIn),
    moneyOut: roundMoney(moneyOut),
    net: roundMoney(moneyIn - moneyOut),
    lineCount,
  };
}
