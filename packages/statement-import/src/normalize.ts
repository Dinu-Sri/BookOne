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
  if (!s) return 0;
  // (1234.56) → -1234.56
  const paren = s.match(/^\((.+)\)$/);
  if (paren) s = `-${paren[1]}`;
  const n = Number.parseFloat(s.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? round2(n) : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type DateParseResult = { iso: string; confidence: number };

/**
 * Ordered strategies: ISO → DD/MM/YYYY → DD-MM-YYYY → Mon DD YYYY / DD Mon YYYY
 */
export function parseStatementDate(value: unknown): DateParseResult {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return { iso: '', confidence: 0 };

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { iso: trimmed, confidence: 1 };
  }

  // DD/MM/YYYY or D/M/YYYY
  const slash = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const y = Number(slash[3]);
    // If first > 12 → must be DD/MM
    if (a > 12) {
      return { iso: ymd(y, b, a), confidence: 0.95 };
    }
    // If second > 12 → must be MM/DD (rare in SL)
    if (b > 12) {
      return { iso: ymd(y, a, b), confidence: 0.9 };
    }
    // Ambiguous: prefer DD/MM (Sri Lanka)
    return { iso: ymd(y, b, a), confidence: 0.7 };
  }

  // Excel serial date (days since 1899-12-30)
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial > 20000 && serial < 80000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      epoch.setUTCDate(epoch.getUTCDate() + Math.floor(serial));
      return {
        iso: epoch.toISOString().slice(0, 10),
        confidence: 0.85,
      };
    }
  }

  // "28 Jul 2026" / "Jul 28, 2026"
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return {
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      confidence: 0.75,
    };
  }

  return { iso: '', confidence: 0 };
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function signedFromDebitCredit(
  debit: number,
  credit: number,
  convention: 'debit_credit' | 'credit_debit' = 'debit_credit',
): number {
  // Book: + in (credit to bank from customer), - out (debit)
  // Most SL banks: Debit = money out, Credit = money in
  if (convention === 'debit_credit') {
    return round2(credit - debit);
  }
  return round2(debit - credit);
}

export function directionFromSigned(amountSigned: number): 'in' | 'out' | 'unknown' {
  if (amountSigned > 0.004) return 'in';
  if (amountSigned < -0.004) return 'out';
  return 'unknown';
}
