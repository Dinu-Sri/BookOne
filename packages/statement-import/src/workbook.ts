/**
 * Shared workbook/CSV matrix loader. CSV keeps original cell text (ISO dates
 * stay YYYY-MM-DD). Excel date cells stay as serials and parse through
 * parseStatementDate.
 */
import * as XLSX from 'xlsx';
import { assertWorkbookReadable, friendlyWorkbookError } from './file-safety';

export function cellStr(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

export function loadWorkbookMatrix(
  bytes: Uint8Array | Buffer,
  fileName: string,
  sheetName?: string,
): { matrix: unknown[][]; sheetNames: string[]; sheetName: string } {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    assertWorkbookReadable(buf, fileName);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
  const lower = fileName.toLowerCase();
  let workbook: XLSX.WorkBook;
  try {
    if (lower.endsWith('.csv') || lower.endsWith('.txt') || lower.endsWith('.tsv')) {
      const text = Buffer.from(buf).toString('utf8').replace(/^\uFEFF/, '');
      workbook = XLSX.read(text, {
        type: 'string',
        raw: true,
        cellDates: false,
        FS: lower.endsWith('.tsv') ? '\t' : undefined,
      });
    } else {
      workbook = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true });
    }
  } catch (e) {
    const friendly = friendlyWorkbookError(e, fileName);
    throw new Error(friendly ?? (e instanceof Error ? e.message : 'Could not read file.'));
  }
  const names = workbook.SheetNames ?? [];
  const name = sheetName && names.includes(sheetName) ? sheetName : names[0] ?? '';
  if (!name) return { matrix: [], sheetNames: names, sheetName: '' };
  let matrix = XLSX.utils.sheet_to_json(workbook.Sheets[name]!, {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];
  matrix = matrix.filter((row) => row.some((c) => cellStr(c) !== ''));
  return { matrix, sheetNames: names, sheetName: name };
}
