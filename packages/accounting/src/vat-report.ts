/**
 * Bookkeeping VAT summary from posted journals.
 *
 * Scope:
 * - Period filter is the same Reports period used by P&L / GL.
 * - Output VAT is account 2200 (credits less debits, so returns reduce output).
 * - Input VAT is account 2300 (debits less credits, so purchase returns reduce input).
 * - Correspondence rows are GL lines on those two accounts in the same period.
 * - Export uses the same `accounting.reports.read` permission as viewing Reports.
 *
 * This is not a statutory VAT return. Synthetic rates do not certify tax
 * registration or filing compliance.
 */

export const OUTPUT_VAT_ACCOUNT_CODE = '2200';
export const INPUT_VAT_ACCOUNT_CODE = '2300';

export const VAT_REPORT_DISCLAIMER =
  'Bookkeeping VAT summary from posted journals on 2200 Output VAT and 2300 Input VAT. This is not a statutory VAT return and does not certify tax registration or filing.';

export type VatReportBalanceRow = {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  balance?: number;
};

export type VatReportLedgerLine = {
  date: string;
  party: string;
  memo: string;
  accountCode: string;
  accountName?: string;
  side: 'debit' | 'credit';
  amount: number;
};

export type VatReportSummary = {
  outputVat: number;
  inputVat: number;
  netPayable: number;
  outputDebit: number;
  outputCredit: number;
  inputDebit: number;
  inputCredit: number;
  correspondence: VatReportLedgerLine[];
  disclaimer: string;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function rowFor(rows: VatReportBalanceRow[], code: string): VatReportBalanceRow | undefined {
  return rows.find((row) => row.accountCode === code);
}

export function composeVatSummary(args: {
  periodBalances: VatReportBalanceRow[];
  correspondence?: VatReportLedgerLine[];
}): VatReportSummary {
  const output = rowFor(args.periodBalances, OUTPUT_VAT_ACCOUNT_CODE);
  const input = rowFor(args.periodBalances, INPUT_VAT_ACCOUNT_CODE);
  const outputDebit = round2(output?.debit ?? 0);
  const outputCredit = round2(output?.credit ?? 0);
  const inputDebit = round2(input?.debit ?? 0);
  const inputCredit = round2(input?.credit ?? 0);
  const outputVat = round2(outputCredit - outputDebit);
  const inputVat = round2(inputDebit - inputCredit);
  const correspondence = (args.correspondence ?? []).filter(
    (line) =>
      line.accountCode === OUTPUT_VAT_ACCOUNT_CODE || line.accountCode === INPUT_VAT_ACCOUNT_CODE,
  );
  return {
    outputVat,
    inputVat,
    netPayable: round2(outputVat - inputVat),
    outputDebit,
    outputCredit,
    inputDebit,
    inputCredit,
    correspondence,
    disclaimer: VAT_REPORT_DISCLAIMER,
  };
}

export function vatReportCsv(summary: VatReportSummary, periodLabel: string): string {
  const lines = [
    'BookOne VAT summary',
    `Period,${csvCell(periodLabel)}`,
    csvCell(summary.disclaimer),
    '',
    'Account,Debit,Credit,Net',
    `Output VAT 2200,${summary.outputDebit.toFixed(2)},${summary.outputCredit.toFixed(2)},${summary.outputVat.toFixed(2)}`,
    `Input VAT 2300,${summary.inputDebit.toFixed(2)},${summary.inputCredit.toFixed(2)},${summary.inputVat.toFixed(2)}`,
    `Net payable (output − input),,,${summary.netPayable.toFixed(2)}`,
    '',
    'Date,Party,Account,Side,Amount,Memo',
    ...summary.correspondence.map(
      (row) =>
        `${csvCell(row.date)},${csvCell(row.party)},${csvCell(row.accountCode)},${row.side},${row.amount.toFixed(2)},${csvCell(row.memo)}`,
    ),
  ];
  return lines.join('\n');
}

function csvCell(value: string): string {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
