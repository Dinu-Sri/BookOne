import { centsToNumber, toCents } from './money';

export type OpeningLineInput = {
  accountCode: string;
  debit: number;
  credit: number;
  isGroup?: boolean;
};

export type OpeningPreview = {
  debitTotal: number;
  creditTotal: number;
  difference: number;
  balanced: boolean;
  lineCount: number;
  issues: string[];
  fingerprint: string;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function previewOpeningBalances(lines: OpeningLineInput[], equityCode = '3000'): OpeningPreview {
  const issues: string[] = [];
  // Exact integer cents (CoreGuard D3): no float sums, no tolerance.
  let debitCents = 0n;
  let creditCents = 0n;
  let lineCount = 0;
  const seen = new Set<string>();
  for (const line of lines) {
    const debit = roundMoney(Number(line.debit) || 0);
    const credit = roundMoney(Number(line.credit) || 0);
    if (debit < 0 || credit < 0) {
      issues.push(`${line.accountCode}: amounts cannot be negative.`);
      continue;
    }
    if (debit > 0 && credit > 0) {
      issues.push(`${line.accountCode}: enter a debit or a credit, not both.`);
      continue;
    }
    if (debit === 0 && credit === 0) continue;
    if (line.isGroup) {
      issues.push(`${line.accountCode}: group headings cannot receive opening balances.`);
      continue;
    }
    if (seen.has(line.accountCode)) {
      issues.push(`${line.accountCode}: duplicate opening line.`);
      continue;
    }
    seen.add(line.accountCode);
    debitCents += toCents(debit);
    creditCents += toCents(credit);
    lineCount += 1;
  }
  const debitTotal = centsToNumber(debitCents);
  const creditTotal = centsToNumber(creditCents);
  const difference = centsToNumber(debitCents - creditCents);
  if (lineCount === 0) issues.push('Enter at least one opening amount.');
  const balanced = debitCents === creditCents;
  if (!balanced) {
    issues.push(
      `Opening entries must balance. Debits ${debitTotal.toFixed(2)} vs credits ${creditTotal.toFixed(2)} (difference ${difference.toFixed(2)}). Offset to ${equityCode} if this is opening equity.`,
    );
  }
  const fingerprint = [...seen]
    .sort()
    .map((code) => {
      const line = lines.find((row) => row.accountCode === code)!;
      return `${code}:${roundMoney(line.debit || 0)}/${roundMoney(line.credit || 0)}`;
    })
    .join('|');
  return {
    debitTotal,
    creditTotal,
    difference,
    balanced,
    lineCount,
    issues,
    fingerprint,
  };
}

export function openingAlreadyPosted(existingFingerprint: string | null | undefined, nextFingerprint: string): boolean {
  return Boolean(existingFingerprint && existingFingerprint === nextFingerprint);
}
