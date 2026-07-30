/**
 * File inspection for Smart Bank Import Studio.
 * Lists sheets, samples rows, detects probable table/header, sniffs account numbers.
 */
import * as XLSX from 'xlsx';
import { detectHeaderAndMap } from './templates';
import { parseAmountCell, parseStatementDate } from './normalize';

export type InspectSheet = {
  name: string;
  rowCount: number;
  colCount: number;
  probableTransactionCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  confidence: 'high' | 'medium' | 'low';
  headerRowIndex: number;
  sampleRows: string[][];
};

export type FileInspection = {
  fileName: string;
  format: 'xlsx' | 'xls' | 'csv' | 'tsv' | 'unknown';
  sheetNames: string[];
  sheets: InspectSheet[];
  bestSheetName: string | null;
  detectedAccountHints: string[];
  detectedCurrency: string | null;
  warnings: string[];
};

function cellStr(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}

function detectFormat(fileName: string): FileInspection['format'] {
  const l = fileName.toLowerCase();
  if (l.endsWith('.xlsx')) return 'xlsx';
  if (l.endsWith('.xls')) return 'xls';
  if (l.endsWith('.csv')) return 'csv';
  if (l.endsWith('.tsv') || l.endsWith('.txt')) return 'tsv';
  return 'unknown';
}

function sniffAccountNumbers(matrix: unknown[][]): string[] {
  const found = new Set<string>();
  const re = /\b(\d{8,16})\b/g;
  const scan = matrix.slice(0, 20);
  for (const row of scan) {
    for (const cell of row as unknown[]) {
      const s = cellStr(cell);
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(s)) !== null) {
        found.add(m[1]!);
        if (found.size >= 5) return [...found];
      }
    }
  }
  return [...found];
}

function sniffCurrency(matrix: unknown[][]): string | null {
  const text = matrix
    .slice(0, 15)
    .flat()
    .map(cellStr)
    .join(' ')
    .toUpperCase();
  if (text.includes('LKR') || text.includes('RS.') || text.includes('රු')) return 'LKR';
  if (text.includes('USD')) return 'USD';
  return null;
}

function scoreSheet(matrix: unknown[][]): {
  probableTransactionCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  confidence: 'high' | 'medium' | 'low';
  headerRowIndex: number;
} {
  if (matrix.length < 2) {
    return {
      probableTransactionCount: 0,
      dateFrom: null,
      dateTo: null,
      confidence: 'low',
      headerRowIndex: 0,
    };
  }
  const detected = detectHeaderAndMap(matrix);
  const header = detected.headerRowIndex;
  const data = matrix.slice(header + 1);
  let dates = 0;
  let amounts = 0;
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  for (const row of data.slice(0, 200)) {
    const cells = row as unknown[];
    let rowDate = false;
    let rowAmt = false;
    for (const c of cells) {
      const d = parseStatementDate(c);
      if (d.iso && d.confidence >= 0.7) {
        rowDate = true;
        if (!dateFrom || d.iso < dateFrom) dateFrom = d.iso;
        if (!dateTo || d.iso > dateTo) dateTo = d.iso;
      }
      if (Math.abs(parseAmountCell(c)) > 0.001) rowAmt = true;
    }
    if (rowDate) dates += 1;
    if (rowAmt) amounts += 1;
  }

  const probable = Math.min(dates, amounts) || Math.max(dates, amounts);
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (probable >= 10 && dates >= 5 && amounts >= 5) confidence = 'high';
  else if (probable >= 3) confidence = 'medium';

  return {
    probableTransactionCount: probable,
    dateFrom,
    dateTo,
    confidence,
    headerRowIndex: header,
  };
}

/**
 * Inspect workbook/CSV bytes without tenant context (pure).
 */
export function inspectStatementFile(
  bytes: Uint8Array | Buffer,
  fileName: string,
): FileInspection {
  const warnings: string[] = [];
  const format = detectFormat(fileName);
  if (format === 'unknown') {
    return {
      fileName,
      format,
      sheetNames: [],
      sheets: [],
      bestSheetName: null,
      detectedAccountHints: [],
      detectedCurrency: null,
      warnings: ['Unsupported file type. Use Excel (.xlsx/.xls) or CSV.'],
    };
  }

  let workbook: XLSX.WorkBook;
  try {
    if (format === 'csv' || format === 'tsv') {
      const text = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '');
      workbook = XLSX.read(text, {
        type: 'string',
        raw: false,
        FS: format === 'tsv' ? '\t' : undefined,
      });
    } else {
      workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true, raw: false });
    }
  } catch {
    return {
      fileName,
      format,
      sheetNames: [],
      sheets: [],
      bestSheetName: null,
      detectedAccountHints: [],
      detectedCurrency: null,
      warnings: [
        'We could not read this file. It may be password-protected or damaged. Download a new statement from your bank.',
      ],
    };
  }

  const sheetNames = workbook.SheetNames ?? [];
  if (sheetNames.length === 0) {
    warnings.push('This workbook has no sheets.');
  }

  const sheets: InspectSheet[] = [];
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    let matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];
    matrix = matrix.filter((row) => row.some((c) => cellStr(c) !== ''));
    const scored = scoreSheet(matrix);
    const maxCols = matrix.reduce((m, r) => Math.max(m, (r as unknown[]).length), 0);
    const sampleRows = matrix.slice(0, 12).map((row) =>
      Array.from({ length: Math.min(maxCols, 10) }, (_, i) => cellStr((row as unknown[])[i])),
    );
    sheets.push({
      name,
      rowCount: matrix.length,
      colCount: maxCols,
      probableTransactionCount: scored.probableTransactionCount,
      dateFrom: scored.dateFrom,
      dateTo: scored.dateTo,
      confidence: scored.confidence,
      headerRowIndex: scored.headerRowIndex,
      sampleRows,
    });
  }

  sheets.sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return (
      rank[b.confidence] - rank[a.confidence] ||
      b.probableTransactionCount - a.probableTransactionCount
    );
  });

  const best = sheets[0] ?? null;
  if (best && best.confidence === 'low') {
    warnings.push('We are not sure this file is a bank transaction statement. Please check the sheet.');
  }

  const firstMatrix = best
    ? (XLSX.utils.sheet_to_json(workbook.Sheets[best.name]!, {
        header: 1,
        defval: '',
        raw: false,
      }) as unknown[][])
    : [];

  return {
    fileName,
    format,
    sheetNames,
    sheets,
    bestSheetName: best?.name ?? null,
    detectedAccountHints: sniffAccountNumbers(firstMatrix),
    detectedCurrency: sniffCurrency(firstMatrix),
    warnings,
  };
}
