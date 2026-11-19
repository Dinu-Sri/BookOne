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
  let debitTotal = 0;
  let creditTotal = 0;
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
    debitTotal += debit;
    creditTotal += credit;
    lineCount += 1;
  }
  debitTotal = roundMoney(debitTotal);
  creditTotal = roundMoney(creditTotal);
  const difference = roundMoney(debitTotal - creditTotal);
  if (lineCount === 0) issues.push('Enter at least one opening amount.');
  const balanced = Math.abs(difference) < 0.005;
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
