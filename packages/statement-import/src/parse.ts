import * as XLSX from 'xlsx';
import type { ColumnMap, ParseProfile, ParseResult, CanonicalStatementLine, SignConvention } from './types';
import {
  directionFromSigned,
  parseAmountCell,
  parseStatementDate,
  signedFromDebitCredit,
} from './normalize';
import { lineFingerprint, normalizeDescription } from './fingerprint';
import { detectHeaderAndMap, GENERIC_PROFILES } from './templates';

function cellStr(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function resolveCol(map: ColumnMap, key: keyof ColumnMap, headers: string[]): number {
  const v = map[key];
  if (typeof v === 'number' && v >= 0) return v;
  if (typeof v === 'string') {
    const i = headers.findIndex((h) => h === v || h.includes(v));
    return i;
  }
  return -1;
}

/**
 * Parse CSV or Excel buffer into canonical statement lines.
 * fingerprintTenantBank required for stable fingerprints (pass ids from app layer).
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
  const lower = fileName.toLowerCase();
  let matrix: unknown[][] = [];

  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const text = Buffer.from(bytes).toString('utf8');
    // strip BOM
    const clean = text.replace(/^\uFEFF/, '');
    const workbook = XLSX.read(clean, { type: 'string', raw: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]!];
    matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as unknown[][];
  } else {
    const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true, raw: false });
    const name =
      opts.sheetName && workbook.SheetNames.includes(opts.sheetName)
        ? opts.sheetName
        : workbook.SheetNames[0];
    if (!name) {
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
    const sheet = workbook.Sheets[name]!;
    matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as unknown[][];
  }

  // Drop trailing empty rows
  matrix = matrix.filter((row) => row.some((c) => String(c ?? '').trim() !== ''));

  const detected = opts.profile
    ? { profile: opts.profile, headerRowIndex: opts.profile.skipRows ?? 0, auto: false }
    : detectHeaderAndMap(matrix);

  const profile = detected.profile;
  const headerRowIndex = detected.headerRowIndex;
  const headerCells = (matrix[headerRowIndex] ?? []).map((c) => String(c ?? '').toLowerCase().trim());
  const dataRows = matrix.slice(headerRowIndex + 1);

  const dateCol = resolveCol(profile.columnMap, 'date', headerCells);
  const descCol = resolveCol(profile.columnMap, 'description', headerCells);
  const amountCol = resolveCol(profile.columnMap, 'amount', headerCells);
  const debitCol = resolveCol(profile.columnMap, 'debit', headerCells);
  const creditCol = resolveCol(profile.columnMap, 'credit', headerCells);
  const balCol = resolveCol(profile.columnMap, 'balance', headerCells);
  const refCol = resolveCol(profile.columnMap, 'ref', headerCells);

  if (dateCol < 0) warnings.push('Date column not confidently detected — review mapping.');
  if (descCol < 0) warnings.push('Description column not confidently detected.');
  if (amountCol < 0 && debitCol < 0 && creditCol < 0) {
    warnings.push('Amount / debit / credit columns not detected.');
  }

  const lines: CanonicalStatementLine[] = [];
  let periodFrom: string | null = null;
  let periodTo: string | null = null;

  dataRows.forEach((row, idx) => {
    const cells = row as unknown[];
    const dateRaw = dateCol >= 0 ? cells[dateCol] : cells[0];
    const { iso, confidence } = parseStatementDate(dateRaw);
    if (!iso) return;

    const description = cellStr(descCol >= 0 ? cells[descCol] : cells[1] ?? 'Bank line');
    if (!description && !parseAmountCell(cells[amountCol])) return;

    let amountSigned = 0;
    const convention = profile.signConvention as SignConvention;
    if (debitCol >= 0 || creditCol >= 0) {
      const debit = parseAmountCell(debitCol >= 0 ? cells[debitCol] : 0);
      const credit = parseAmountCell(creditCol >= 0 ? cells[creditCol] : 0);
      amountSigned = signedFromDebitCredit(
        debit,
        credit,
        convention === 'credit_debit' ? 'credit_debit' : 'debit_credit',
      );
    } else {
      amountSigned = parseAmountCell(amountCol >= 0 ? cells[amountCol] : cells[2]);
      // If bank uses positive-only with type column, leave as-is
    }

    if (Math.abs(amountSigned) < 0.001) return;

    const balanceAfter =
      balCol >= 0 ? parseAmountCell(cells[balCol]) : undefined;
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

  // Dedup within file
  const seen = new Set<string>();
  const unique = lines.filter((l) => {
    if (seen.has(l.fingerprint)) return false;
    seen.add(l.fingerprint);
    return true;
  });
  if (unique.length < lines.length) {
    warnings.push(`Removed ${lines.length - unique.length} duplicate rows within file.`);
  }

  return {
    lines: unique,
    profile,
    profileAuto: detected.auto,
    warnings,
    periodFrom,
    periodTo,
    headerRowIndex,
  };
}

export { normalizeDescription };
