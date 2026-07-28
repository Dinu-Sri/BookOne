import * as XLSX from 'xlsx';
import type {
  ColumnMap,
  ParseProfile,
  ParseResult,
  CanonicalStatementLine,
  SignConvention,
  SheetPreview,
} from './types';
import {
  directionFromSigned,
  parseAmountCell,
  parseStatementDate,
  signedFromAmountAndType,
  signedFromDebitCredit,
} from './normalize';
import { lineFingerprint } from './fingerprint';
import { detectHeaderAndMap, GENERIC_PROFILES } from './templates';

function cellStr(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

function resolveCol(map: ColumnMap, key: keyof ColumnMap, headers: string[]): number {
  const v = map[key];
  if (typeof v === 'number' && v >= 0) return v;
  if (typeof v === 'string' && v !== '') {
    const needle = v.toLowerCase().trim();
    const i = headers.findIndex((h) => {
      const hh = h.toLowerCase().trim();
      return hh === needle || hh.includes(needle);
    });
    return i;
  }
  return -1;
}

function readMatrix(
  bytes: Uint8Array | Buffer,
  fileName: string,
  sheetName?: string,
): { matrix: unknown[][]; sheetNames: string[]; sheetName: string } {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const text = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '');
    const workbook = XLSX.read(text, { type: 'string', raw: false });
    const name = workbook.SheetNames[0] ?? 'Sheet1';
    const sheet = workbook.Sheets[name];
    const matrix = sheet
      ? (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as unknown[][])
      : [];
    return { matrix, sheetNames: workbook.SheetNames, sheetName: name };
  }

  const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true, raw: false });
  const name =
    sheetName && workbook.SheetNames.includes(sheetName)
      ? sheetName
      : workbook.SheetNames[0] ?? '';
  if (!name) return { matrix: [], sheetNames: workbook.SheetNames, sheetName: '' };
  const sheet = workbook.Sheets[name]!;
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];
  return { matrix, sheetNames: workbook.SheetNames, sheetName: name };
}

/**
 * Preview first rows for manual column mapping (no fingerprint / no tenant needed).
 */
export function previewStatementSheet(
  bytes: Uint8Array | Buffer,
  fileName: string,
  opts?: { sheetName?: string; maxRows?: number },
): SheetPreview {
  const { matrix: raw, sheetNames, sheetName } = readMatrix(bytes, fileName, opts?.sheetName);
  const matrix = raw.filter((row) => row.some((c) => String(c ?? '').trim() !== ''));
  const detected = detectHeaderAndMap(matrix);
  const maxRows = opts?.maxRows ?? 35;
  const rows = matrix.slice(0, maxRows).map((row) =>
    (row as unknown[]).map((c) => cellStr(c)),
  );
  const maxColumns = rows.reduce((m, r) => Math.max(m, r.length), 0);

  return {
    sheetNames,
    sheetName,
    rows,
    maxColumns,
    suggested: detected.profile,
    headerRowIndex: detected.headerRowIndex,
  };
}

/**
 * Parse CSV or Excel buffer into canonical statement lines.
 */
export function parseStatementFile(
  bytes: Uint8Array | Buffer,
  fileName: string,
  opts: {
    tenantId: string;
    bankAccountId: string;
    profile?: ParseProfile | null;
    sheetName?: string;
  },
): ParseResult {
  const warnings: string[] = [];
  const { matrix: rawMatrix } = readMatrix(bytes, fileName, opts.sheetName ?? opts.profile?.sheetName);
  let matrix = rawMatrix.filter((row) => row.some((c) => String(c ?? '').trim() !== ''));

  if (matrix.length === 0) {
    return {
      lines: [],
      profile: GENERIC_PROFILES[0]!,
      profileAuto: true,
      warnings: ['No sheet found in workbook'],
      periodFrom: null,
      periodTo: null,
      headerRowIndex: 0,
    };
  }

  const detected = opts.profile
    ? {
        profile: {
          ...opts.profile,
          sheetName: opts.profile.sheetName ?? opts.sheetName,
        },
        headerRowIndex: opts.profile.skipRows ?? 0,
        auto: false,
      }
    : detectHeaderAndMap(matrix);

  const profile = detected.profile;
  const headerRowIndex = Math.max(0, Math.min(detected.headerRowIndex, matrix.length - 1));
  const headerCells = (matrix[headerRowIndex] ?? []).map((c) => String(c ?? '').toLowerCase().trim());
  const dataRows = matrix.slice(headerRowIndex + 1);

  const dateCol = resolveCol(profile.columnMap, 'date', headerCells);
  const descCol = resolveCol(profile.columnMap, 'description', headerCells);
  const amountCol = resolveCol(profile.columnMap, 'amount', headerCells);
  const debitCol = resolveCol(profile.columnMap, 'debit', headerCells);
  const creditCol = resolveCol(profile.columnMap, 'credit', headerCells);
  const balCol = resolveCol(profile.columnMap, 'balance', headerCells);
  const refCol = resolveCol(profile.columnMap, 'ref', headerCells);
  const typeCol = resolveCol(profile.columnMap, 'type', headerCells);

  if (dateCol < 0) warnings.push('Date column not set — review mapping.');
  if (descCol < 0) warnings.push('Description column not set — review mapping.');

  const convention = profile.signConvention as SignConvention;
  if (convention === 'amount_with_type') {
    if (amountCol < 0 || typeCol < 0) {
      warnings.push('Amount + DR/CR type columns required for this layout.');
    }
  } else if (convention === 'debit_credit' || convention === 'credit_debit') {
    if (debitCol < 0 && creditCol < 0) {
      warnings.push('Debit / Credit columns not set — review mapping.');
    }
  } else if (amountCol < 0 && debitCol < 0 && creditCol < 0) {
    warnings.push('Amount / debit / credit columns not set.');
  }

  const lines: CanonicalStatementLine[] = [];
  let periodFrom: string | null = null;
  let periodTo: string | null = null;
  let skippedNoDate = 0;
  let skippedZero = 0;

  dataRows.forEach((row, idx) => {
    const cells = row as unknown[];
    const dateRaw = dateCol >= 0 ? cells[dateCol] : cells[0];
    const { iso, confidence } = parseStatementDate(dateRaw);
    if (!iso) {
      skippedNoDate += 1;
      return;
    }

    const description = cellStr(descCol >= 0 ? cells[descCol] : cells[1] ?? 'Bank line');

    let amountSigned = 0;
    if (convention === 'amount_with_type' || (typeCol >= 0 && amountCol >= 0)) {
      amountSigned = signedFromAmountAndType(
        amountCol >= 0 ? cells[amountCol] : 0,
        typeCol >= 0 ? cells[typeCol] : '',
      );
    } else if (debitCol >= 0 || creditCol >= 0) {
      const debit = parseAmountCell(debitCol >= 0 ? cells[debitCol] : 0);
      const credit = parseAmountCell(creditCol >= 0 ? cells[creditCol] : 0);
      amountSigned = signedFromDebitCredit(
        debit,
        credit,
        convention === 'credit_debit' ? 'credit_debit' : 'debit_credit',
      );
    } else {
      amountSigned = parseAmountCell(amountCol >= 0 ? cells[amountCol] : cells[2]);
    }

    if (Math.abs(amountSigned) < 0.001) {
      skippedZero += 1;
      return;
    }

    const balanceAfter = balCol >= 0 ? parseAmountCell(cells[balCol]) : undefined;
    const externalRef = refCol >= 0 ? cellStr(cells[refCol]) || undefined : undefined;
    const direction = directionFromSigned(amountSigned);

    const fingerprint = lineFingerprint({
      tenantId: opts.tenantId,
      bankAccountId: opts.bankAccountId,
      date: iso,
      amountSigned,
      description,
      externalRef,
    });

    const raw: Record<string, unknown> = {};
    headerCells.forEach((h, i) => {
      if (h) raw[h] = cells[i];
    });

    lines.push({
      rowNumber: headerRowIndex + idx + 2,
      date: iso,
      description: description || 'Bank line',
      amountSigned,
      direction,
      balanceAfter: balanceAfter || undefined,
      externalRef,
      fingerprint,
      dateConfidence: confidence,
      raw,
    });

    if (!periodFrom || iso < periodFrom) periodFrom = iso;
    if (!periodTo || iso > periodTo) periodTo = iso;
  });

  if (skippedNoDate > 0) {
    warnings.push(`Skipped ${skippedNoDate} row(s) without a valid date.`);
  }
  if (skippedZero > 0 && lines.length === 0) {
    warnings.push(
      `All data rows had zero amount — check Debit/Credit vs Amount + DR/CR mapping.`,
    );
  }

  const seen = new Set<string>();
  const unique = lines.filter((l) => {
    if (seen.has(l.fingerprint)) return false;
    seen.add(l.fingerprint);
    return true;
  });
  if (unique.length < lines.length) {
    warnings.push(`Removed ${lines.length - unique.length} duplicate rows within file.`);
  }

  // Sanity: if net is huge vs line count, still return lines (user must confirm)
  if (unique.length > 0) {
    const sample = unique.slice(0, 3).map((l) => `${l.date} ${l.amountSigned} ${l.description.slice(0, 24)}`);
    warnings.push(`Sample: ${sample.join(' · ')}`);
  }

  return {
    lines: unique,
    profile: {
      ...profile,
      skipRows: headerRowIndex,
    },
    profileAuto: detected.auto,
    warnings,
    periodFrom,
    periodTo,
    headerRowIndex,
  };
}

export { normalizeDescription } from './fingerprint';
