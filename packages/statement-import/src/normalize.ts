/**
 * SL-biased date + amount parsers for bank exports.
 * Prefer DD/MM/YYYY over US MM/DD when ambiguous.
 */

export function parseAmountCell(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return round2(value);
  let s = String(value ?? '')
    .replace(/LKR/gi, '')
    .replace(/Rs\.?/gi, '')
    .replace(/\s/g, '')
    .replace(/,/g, '')
    .trim();
  if (!s || s === '-' || s === '—' || s === '–' || s === '.' || s.toLowerCase() === 'nil') {
    return 0;
  }
  // (1234.56) → -1234.56
  const paren = s.match(/^\((.+)\)$/);
  if (paren) s = `-${paren[1]}`;
  const n = Number.parseFloat(s.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? round2(n) : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type DateFormatHint = 'iso' | 'dmy' | 'mdy' | 'excel-serial' | 'auto';

export type DateParseResult = { iso: string; confidence: number; original: string };

export type DateParseOptions = {
  format?: DateFormatHint;
  dayFirst?: boolean;
};

/**
 * Ordered strategies: ISO → explicit format → DD/MM/YYYY → Excel serial → named months.
 * Two-digit years need an explicit format, or one part greater than 12.
 */

function expandYear(year: number): number {
  if (year >= 1000) return year;
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

function calendarDate(
  year: number,
  month: number,
  day: number,
  confidence: number,
  original: string,
): DateParseResult {
  if (!isValidCalendarDate(year, month, day)) return { iso: '', confidence: 0, original };
  return { iso: ymd(year, month, day), confidence, original };
}

function slashParts(
  a: number,
  b: number,
  year: number,
  original: string,
  format: DateFormatHint,
  dayFirst: boolean,
): DateParseResult {
  const y = expandYear(year);
  if (format === 'mdy' || (!dayFirst && format === 'auto')) {
    return calendarDate(y, a, b, a > 12 || b > 12 ? 0.9 : 0.7, original);
  }
  if (format === 'dmy' || dayFirst) {
    if (a > 12) return calendarDate(y, b, a, 0.95, original);
    if (b > 12) return calendarDate(y, a, b, 0.9, original);
    return calendarDate(y, b, a, format === 'dmy' ? 0.9 : 0.7, original);
  }
  if (a > 12) return calendarDate(y, b, a, 0.95, original);
  if (b > 12) return calendarDate(y, a, b, 0.9, original);
  return { iso: '', confidence: 0, original };
}

export function parseStatementDate(value: unknown, opts?: DateParseOptions): DateParseResult {
  const format = opts?.format ?? 'auto';
  const dayFirst = opts?.dayFirst !== false;
  const original =
    value instanceof Date && !Number.isNaN(value.getTime())
      ? ymd(value.getFullYear(), value.getMonth() + 1, value.getDate())
      : String(value ?? '').trim();

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return calendarDate(value.getFullYear(), value.getMonth() + 1, value.getDate(), 0.95, original);
  }

  const trimmed = original;
  if (!trimmed) return { iso: '', confidence: 0, original: '' };

  if (format === 'iso' || format === 'auto') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const y = Number(trimmed.slice(0, 4));
      const m = Number(trimmed.slice(5, 7));
      const d = Number(trimmed.slice(8, 10));
      return calendarDate(y, m, d, 1, original);
    }
  }

  if (format === 'excel-serial' || format === 'auto') {
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const serial = Number(trimmed);
      if (serial > 20000 && serial < 80000) {
        const epoch = new Date(Date.UTC(1899, 11, 30));
        epoch.setUTCDate(epoch.getUTCDate() + Math.floor(serial));
        return {
          iso: epoch.toISOString().slice(0, 10),
          confidence: 0.85,
          original,
        };
      }
    }
  }

  const slash4 = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (slash4 && format !== 'iso' && format !== 'excel-serial') {
    return slashParts(Number(slash4[1]), Number(slash4[2]), Number(slash4[3]), original, format, dayFirst);
  }

  const slash2 = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
  if (slash2 && format !== 'iso' && format !== 'excel-serial') {
    const a = Number(slash2[1]);
    const b = Number(slash2[2]);
    const y = Number(slash2[3]);
    const explicit = format === 'dmy' || format === 'mdy';
    const unambiguous = a > 12 || b > 12;
    if (explicit || unambiguous) {
      return slashParts(a, b, y, original, format, dayFirst);
    }
    return { iso: '', confidence: 0, original };
  }

  if (format === 'iso' || format === 'excel-serial') {
    return { iso: '', confidence: 0, original };
  }

  const dmyNamed = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
  if (dmyNamed) {
    const month = monthNumber(dmyNamed[2]!);
    if (!month) return { iso: '', confidence: 0, original };
    return calendarDate(Number(dmyNamed[3]), month, Number(dmyNamed[1]), 0.8, original);
  }

  const mdyNamed = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdyNamed) {
    const month = monthNumber(mdyNamed[1]!);
    if (!month) return { iso: '', confidence: 0, original };
    return calendarDate(Number(mdyNamed[3]), month, Number(mdyNamed[2]), 0.75, original);
  }

  return { iso: '', confidence: 0, original };
}

export function detectDateFormat(samples: unknown[]): DateFormatHint {
  let iso = 0;
  let serial = 0;
  let slash = 0;
  for (const sample of samples) {
    const t = String(sample ?? '').trim();
    if (!t) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) iso += 1;
    else if (/^\d+(\.\d+)?$/.test(t) && Number(t) > 20000 && Number(t) < 80000) serial += 1;
    else if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(t)) slash += 1;
  }
  if (iso > 0 && iso >= serial && iso >= slash) return 'iso';
  if (serial > 0 && serial >= iso && serial >= slash) return 'excel-serial';
  if (slash > 0) return 'dmy';
  return 'auto';
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function monthNumber(token: string): number | null {
  return MONTH_INDEX[token.toLowerCase()] ?? null;
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function signedFromDebitCredit(
  debit: number,
  credit: number,
  convention: 'debit_credit' | 'credit_debit' = 'debit_credit',
): number {
  // Book: + in (credit to bank), - out (debit)
  // Most SL banks: Debit = money out, Credit = money in
  if (convention === 'debit_credit') {
    return round2(credit - debit);
  }
  return round2(debit - credit);
}

/** Interpret Sampath-style DR/CR (or D/C) flag with an amount cell. */
export function signedFromAmountAndType(amountRaw: unknown, typeRaw: unknown): number {
  const abs = Math.abs(parseAmountCell(amountRaw));
  if (abs < 0.001) return 0;
  const t = String(typeRaw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  // Credit / C / CR = money in (+)
  if (
    t === 'c' ||
    t === 'cr' ||
    t === 'credit' ||
    t.startsWith('cr') ||
    t.includes('credit') ||
    t === 'deposit' ||
    t === '+'
  ) {
    return abs;
  }
  // Debit / D / DR = money out (-)
  if (
    t === 'd' ||
    t === 'dr' ||
    t === 'debit' ||
    t.startsWith('dr') ||
    t.includes('debit') ||
    t === 'withdrawal' ||
    t === '-'
  ) {
    return -abs;
  }
  // Unknown type: trust the amount's own sign if present
  const signed = parseAmountCell(amountRaw);
  return signed;
}

export function directionFromSigned(amountSigned: number): 'in' | 'out' | 'unknown' {
  if (amountSigned > 0.004) return 'in';
  if (amountSigned < -0.004) return 'out';
  return 'unknown';
}
