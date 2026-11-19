/**
 * Studio transform: matrix + mapping → normalized bank lines + validation.
 * Server-only (uses node:crypto + xlsx). UI should import from `./studio-client`.
 */
import { createHash } from 'node:crypto';
import {
  detectDateFormat,
  directionFromSigned,
  parseAmountCell,
  parseStatementDate,
  type DateFormatHint,
} from './normalize';
import { interpretAmount, type AmountRules, suggestAmountModeFromHeaders } from './amount-rules';
import { checkStatementBalance, totalsFromSignedAmounts } from './validate-balance';
import { detectHeaderAndMap } from './templates';
import { lineFingerprint } from './fingerprint';
import { annotateBalanceContinuity } from './balance';
import { cellStr, loadWorkbookMatrix } from './workbook';
import type { StudioLine, StudioMapping, StudioTransformResult } from './studio-transform-types';

export type {
  StudioLine,
  StudioMapping,
  StudioTransformResult,
} from './studio-transform-types';

export { cellStr, loadWorkbookMatrix } from './workbook';

function rowHash(cells: unknown[]): string {
  return createHash('sha256')
    .update(cells.map((c) => cellStr(c)).join('\t'))
    .digest('hex')
    .slice(0, 32);
}

const EXCLUDE_DESC = [
  'opening balance',
  'closing balance',
  'brought forward',
  'b/f',
  'c/f',
  'carried forward',
  'balance b/f',
  'balance c/f',
  'total',
  'totals',
  'generated on',
  'statement period',
];

function shouldExcludeDescription(desc: string): boolean {
  const d = desc.toLowerCase().trim();
  if (!d) return false;
  return EXCLUDE_DESC.some((x) => d === x || d.startsWith(x));
}

/**
 * Suggest mapping from matrix (auto-detect).
 */
export function suggestStudioMapping(matrix: unknown[][]): StudioMapping {
  const detected = detectHeaderAndMap(matrix);
  const headerRowIndex = detected.headerRowIndex;
  const headers = (matrix[headerRowIndex] ?? []).map((c) => cellStr(c));
  const map = detected.profile.columnMap;
  const dateCol = typeof map.date === 'number' ? map.date : 0;
  const descriptionCol = typeof map.description === 'number' ? map.description : 1;
  const balanceCol = typeof map.balance === 'number' ? map.balance : null;
  const amountSuggest = suggestAmountModeFromHeaders(headers);

  const amountRules: AmountRules = {
    mode: amountSuggest.mode,
    moneyOutCol: amountSuggest.moneyOutCol,
    moneyInCol: amountSuggest.moneyInCol,
    amountCol: amountSuggest.amountCol,
    typeCol: amountSuggest.typeCol,
    negativeMeansOut: true,
    drMeansOut: true,
  };

  const refCol = typeof map.ref === 'number' ? map.ref : null;
  const dateSamples = columnSamples(matrix, headerRowIndex, dateCol, 8);
  const dateFormat = detectDateFormat(dateSamples);

  return {
    headerRowIndex,
    dateCol,
    descriptionCol,
    refCol,
    balanceCol,
    amountRules,
    dayFirst: true,
    dateFormat,
  };
}

export function transformStudioMatrix(
  matrix: unknown[][],
  mapping: StudioMapping,
  opts: { tenantId: string; bankAccountId: string },
): StudioTransformResult {
  const headerRowIndex = Math.max(0, Math.min(mapping.headerRowIndex, matrix.length - 1));
  const headers = (matrix[headerRowIndex] ?? []).map((c) => cellStr(c).toLowerCase());
  const dataRows = matrix.slice(headerRowIndex + 1);

  const dateFormat: DateFormatHint = mapping.dateFormat ?? 'auto';
  const lines: StudioLine[] = [];
  let inputRowCount = 0;
  let skippedCount = 0;
  let excludedCount = 0;
  const issueMap = new Map<string, { type: string; severity: 'error' | 'warning'; title: string; count: number; sample?: string }>();

  const bump = (
    type: string,
    severity: 'error' | 'warning',
    title: string,
    sample?: string,
  ) => {
    const cur = issueMap.get(type);
    if (cur) {
      cur.count += 1;
      if (!cur.sample && sample) cur.sample = sample;
    } else {
      issueMap.set(type, { type, severity, title, count: 1, sample });
    }
  };

  let periodFrom: string | null = null;
  let periodTo: string | null = null;

  dataRows.forEach((row, idx) => {
    const cells = row as unknown[];
    const rowNumber = headerRowIndex + idx + 2;
    const messages: string[] = [];
    let validationStatus: StudioLine['validationStatus'] = 'valid';

    // Skip empty rows
    if (!cells.some((c) => cellStr(c) !== '')) return;
    inputRowCount += 1;

    // Skip repeated header
    const firstCells = cells
      .slice(0, 4)
      .map((c) => cellStr(c).toLowerCase())
      .join('|');
    const headerSig = headers.slice(0, 4).join('|');
    if (firstCells && headerSig && firstCells === headerSig) {
      excludedCount += 1;
      bump('repeated_header', 'warning', 'Repeated header rows skipped');
      return;
    }

    const dateRaw = mapping.dateCol >= 0 ? cells[mapping.dateCol] : cells[0];
    const parsedDate = parseStatementDate(dateRaw, {
      format: dateFormat,
      dayFirst: mapping.dayFirst !== false,
    });
    const iso = parsedDate.iso;
    const confidence = parsedDate.confidence;
    const originalDateText = parsedDate.original || cellStr(dateRaw);
    if (!iso) {
      const amtProbe = interpretAmount(cells, mapping.amountRules);
      if (Math.abs(amtProbe.signedAmount) < 0.001 && !amtProbe.unknownLabel) {
        skippedCount += 1;
        return;
      }
      messages.push('Invalid or missing date');
      validationStatus = 'error';
      bump('invalid_date', 'error', 'Rows with invalid dates', originalDateText);
    }

    let description = '';
    if (mapping.descriptionCol >= 0) {
      description = cellStr(cells[mapping.descriptionCol]);
    }
    if (mapping.descriptionExtraCols?.length) {
      const extra = mapping.descriptionExtraCols
        .map((c) => cellStr(cells[c]))
        .filter(Boolean);
      if (extra.length) {
        description = [description, ...extra].filter(Boolean).join(' | ');
      }
    }
    if (!description) description = 'Bank line';

    if (shouldExcludeDescription(description)) {
      excludedCount += 1;
      bump('excluded_summary', 'warning', 'Summary / balance rows excluded', description);
      return;
    }

    const money = interpretAmount(cells, mapping.amountRules);
    if (money.error === 'empty_amount' && !iso) {
      skippedCount += 1;
      return;
    }
    if (money.error === 'empty_amount') {
      skippedCount += 1;
      return;
    }
    if (money.error === 'ignored_money_label') {
      skippedCount += 1;
      bump(
        'ignored_label',
        'warning',
        'Rows skipped (ignored money labels)',
        money.unknownLabel,
      );
      return;
    }
    if (money.error === 'both_in_and_out') {
      messages.push('Both Money Out and Money In have values');
      validationStatus = 'error';
      bump('both_in_out', 'error', 'Rows with both Money Out and Money In filled');
    } else if (money.error === 'unknown_money_label') {
      messages.push(`Unknown money label: ${money.unknownLabel}`);
      validationStatus = 'error';
      bump(
        'unknown_label',
        'error',
        `Unknown money direction “${money.unknownLabel}”`,
        money.unknownLabel,
      );
    } else if (money.error === 'money_columns_missing') {
      messages.push('Money columns not configured');
      validationStatus = 'error';
      bump('money_setup', 'error', 'Money columns not set up');
    } else if (money.direction === 'unknown') {
      messages.push('Could not determine Money In or Out');
      validationStatus = 'error';
      bump('unknown_direction', 'error', 'Rows with unclear money direction');
    }

    if (confidence < 0.75 && iso) {
      messages.push('Date format is ambiguous — please verify');
      if (validationStatus === 'valid') validationStatus = 'warning';
      bump('ambiguous_date', 'warning', 'Ambiguous dates (DD/MM vs MM/DD)');
    }

    const balanceAfter =
      mapping.balanceCol != null && mapping.balanceCol >= 0
        ? parseAmountCell(cells[mapping.balanceCol])
        : undefined;

    const signedAmount = money.signedAmount;
    const direction =
      money.direction !== 'unknown' ? money.direction : directionFromSigned(signedAmount);

    const date = iso || '1970-01-01';
    if (iso) {
      if (!periodFrom || iso < periodFrom) periodFrom = iso;
      if (!periodTo || iso > periodTo) periodTo = iso;
    }

    const externalRef =
      mapping.refCol != null && mapping.refCol >= 0 ? cellStr(cells[mapping.refCol]) || undefined : undefined;

    const fingerprint = lineFingerprint({
      tenantId: opts.tenantId,
      bankAccountId: opts.bankAccountId,
      date,
      amountSigned: signedAmount,
      description,
      externalRef,
    });

    const raw: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (h) raw[h] = cells[i];
    });

    lines.push({
      rowNumber,
      date,
      dateConfidence: confidence,
      originalDateText,
      description: description.slice(0, 1000),
      externalRef,
      signedAmount,
      debitAmount: money.debitAmount,
      creditAmount: money.creditAmount,
      direction,
      balanceAfter: balanceAfter && Math.abs(balanceAfter) > 0 ? balanceAfter : undefined,
      fingerprint,
      sourceRowHash: rowHash(cells),
      validationStatus,
      validationMessages: messages,
      raw,
      unknownLabel: money.unknownLabel,
    });
  });

  // Dedup fingerprints within file — keep first, mark later as error
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.fingerprint)) {
      line.validationStatus = 'error';
      line.validationMessages = [...line.validationMessages, 'Duplicate of another row in this file'];
      bump('duplicate_row', 'error', 'Duplicate rows inside this file');
    } else {
      seen.add(line.fingerprint);
    }
  }

  // Running-balance continuity when balance column mapped (multi-statement hardening)
  const hasBalanceCol = mapping.balanceCol != null && mapping.balanceCol >= 0;
  if (hasBalanceCol) {
    const cont = annotateBalanceContinuity(
      lines.map((l) => ({
        rowNumber: l.rowNumber,
        date: l.date,
        description: l.description,
        amountSigned: l.signedAmount,
        direction: l.direction,
        balanceAfter: l.balanceAfter,
        fingerprint: l.fingerprint,
        dateConfidence: l.dateConfidence,
        raw: l.raw,
      })),
    );
    let breaks = 0;
    for (const line of lines) {
      if (cont.get(line.rowNumber) === 'BALANCE_BREAK') {
        breaks += 1;
        line.validationMessages = [
          ...line.validationMessages,
          'Running balance does not follow previous line',
        ];
        if (line.validationStatus === 'valid') line.validationStatus = 'warning';
        const rawFlags = Array.isArray((line.raw as { _flags?: unknown })._flags)
          ? ([...(line.raw as { _flags: string[] })._flags] as string[])
          : [];
        if (!rawFlags.includes('BALANCE_BREAK')) rawFlags.push('BALANCE_BREAK');
        line.raw = { ...line.raw, _flags: rawFlags };
      }
    }
    if (breaks > 0) {
      bump(
        'balance_break',
        'warning',
        `${breaks} running-balance break(s) — check missing or reordered rows`,
      );
    }
  }

  const usable = lines.filter((l) => l.validationStatus === 'valid' || l.validationStatus === 'warning');
  let inferredOpening: number | null = null;
  let inferredClosing: number | null = null;
  if (usable.length > 0 && mapping.balanceCol != null && mapping.balanceCol >= 0) {
    const first = usable[0]!;
    const last = usable[usable.length - 1]!;
    if (first.balanceAfter != null) {
      inferredOpening = Math.round((first.balanceAfter - first.signedAmount) * 100) / 100;
    }
    if (last.balanceAfter != null) {
      inferredClosing = last.balanceAfter;
    }
  }
  const opening = mapping.openingBalance ?? inferredOpening;
  const closing = mapping.closingBalance ?? inferredClosing;

  const totalsBase = totalsFromSignedAmounts(
    usable.map((l) => l.signedAmount),
    opening,
    closing,
  );

  const balanceCheck = checkStatementBalance(totalsBase);
  if (!balanceCheck.ok && !issueMap.has('balance_mismatch')) {
    bump('balance_mismatch', 'error', balanceCheck.message);
  }

  const readyCount = lines.filter((l) => l.validationStatus === 'valid').length;
  const errorCount = lines.filter((l) => l.validationStatus === 'error').length;
  const warningCount = lines.filter((l) => l.validationStatus === 'warning').length;
  const duplicateCount = lines.filter((l) =>
    l.validationMessages.some((m) => m.toLowerCase().includes('duplicate')),
  ).length;

  return {
    lines,
    headers,
    headerRowIndex,
    totals: {
      totalMoneyIn: totalsBase.totalMoneyIn,
      totalMoneyOut: totalsBase.totalMoneyOut,
      transactionCount: totalsBase.transactionCount,
      periodFrom,
      periodTo,
    },
    balanceCheck,
    issues: [...issueMap.values()],
    readyCount,
    errorCount,
    warningCount,
    excludedCount,
    skippedCount,
    duplicateCount,
    inputRowCount,
    inferredOpening,
    inferredClosing,
    dateFormat,
    samplePreview: lines.filter((l) => l.validationStatus === 'valid').slice(0, 12),
  };
}

export {
  collectUnknownMoneyLabels,
  type UnknownLabelIssue,
} from './unknown-labels';

export function columnSamples(matrix: unknown[][], headerRowIndex: number, col: number, n = 5): string[] {
  const out: string[] = [];
  for (const row of matrix.slice(headerRowIndex + 1)) {
    const v = cellStr((row as unknown[])[col]);
    if (!v) continue;
    out.push(v);
    if (out.length >= n) break;
  }
  return out;
}

export function listColumns(
  matrix: unknown[][],
  headerRowIndex: number,
): { index: number; label: string; samples: string[] }[] {
  const headers = (matrix[headerRowIndex] ?? []) as unknown[];
  const maxCols = Math.max(
    headers.length,
    ...matrix.slice(0, headerRowIndex + 15).map((r) => (r as unknown[]).length),
  );
  const cols: { index: number; label: string; samples: string[] }[] = [];
  for (let i = 0; i < maxCols; i++) {
    const label = cellStr(headers[i]) || `Column ${i + 1}`;
    cols.push({ index: i, label, samples: columnSamples(matrix, headerRowIndex, i) });
  }
  return cols;
}
