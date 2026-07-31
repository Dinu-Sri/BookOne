/**
 * Structured amount interpretation (Studio modes A–D).
 * Deterministic — no eval, no AI.
 */
import { parseAmountCell, signedFromDebitCredit } from './normalize';

export type AmountMode =
  | 'debit_credit' // A: separate Money Out / Money In columns
  | 'signed_amount' // B: one amount, signed
  | 'amount_with_type' // C: amount + DR/CR column
  | 'embedded_indicator'; // D: "5,000.00 DR" in amount cell

export type AmountRules = {
  mode: AmountMode;
  /** Money Out column index (mode A) */
  moneyOutCol?: number;
  /** Money In column index (mode A) */
  moneyInCol?: number;
  /** Single amount column (B/C/D) */
  amountCol?: number;
  /** DR/CR type column (C) */
  typeCol?: number;
  /** For signed_amount: does negative mean Money Out? default true */
  negativeMeansOut?: boolean;
  /** For type/embedded: does DR mean Money Out? default true */
  drMeansOut?: boolean;
  /** Extra tokens (merged with built-in defaults; from issue wizard) */
  moneyOutTokens?: string[];
  moneyInTokens?: string[];
  /**
   * Labels the user chose to skip entirely (issue wizard "Ignore").
   * Matching rows are excluded from import, not errors.
   */
  ignoreMoneyLabels?: string[];
};

export type AmountInterpretResult = {
  signedAmount: number;
  debitAmount: number;
  creditAmount: number;
  direction: 'in' | 'out' | 'unknown';
  /** Blocking if set */
  error?: string;
  /** Unknown label for UI (mode C/D) */
  unknownLabel?: string;
};

export const DEFAULT_MONEY_OUT_TOKENS = [
  'dr',
  'd',
  'debit',
  'withdrawal',
  'wd',
  'db',
  'out',
  'paid',
];
export const DEFAULT_MONEY_IN_TOKENS = [
  'cr',
  'c',
  'credit',
  'deposit',
  'dep',
  'in',
  'received',
];

function normToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokenMatch(raw: string, token: string): boolean {
  const t = normToken(raw);
  const n = normToken(token);
  if (!t || !n) return false;
  return t === n || t.includes(n) || n.includes(t);
}

function classifyToken(
  raw: string,
  outTokens: string[],
  inTokens: string[],
): 'out' | 'in' | 'unknown' {
  const t = normToken(raw);
  if (!t) return 'unknown';
  if (outTokens.some((x) => tokenMatch(raw, x))) return 'out';
  if (inTokens.some((x) => tokenMatch(raw, x))) return 'in';
  return 'unknown';
}

function isIgnoredLabel(raw: string, ignore: string[] | undefined): boolean {
  if (!ignore?.length) return false;
  return ignore.some((x) => tokenMatch(raw, x));
}

/** Built-in tokens plus any user-resolved extras (never drop defaults). */
export function mergeAmountTokens(rules: AmountRules): {
  out: string[];
  in: string[];
} {
  return {
    out: [...DEFAULT_MONEY_OUT_TOKENS, ...(rules.moneyOutTokens ?? [])],
    in: [...DEFAULT_MONEY_IN_TOKENS, ...(rules.moneyInTokens ?? [])],
  };
}

function pack(signed: number): AmountInterpretResult {
  if (Math.abs(signed) < 0.001) {
    return {
      signedAmount: 0,
      debitAmount: 0,
      creditAmount: 0,
      direction: 'unknown',
      error: 'empty_amount',
    };
  }
  return {
    signedAmount: signed,
    debitAmount: signed < 0 ? Math.abs(signed) : 0,
    creditAmount: signed > 0 ? signed : 0,
    direction: signed > 0 ? 'in' : 'out',
  };
}

/**
 * Interpret one data row's money cells using studio amount rules.
 */
export function interpretAmount(
  cells: unknown[],
  rules: AmountRules,
): AmountInterpretResult {
  const { out: outTok, in: inTok } = mergeAmountTokens(rules);
  const drOut = rules.drMeansOut !== false;
  const negOut = rules.negativeMeansOut !== false;

  if (rules.mode === 'debit_credit') {
    const outCol = rules.moneyOutCol ?? -1;
    const inCol = rules.moneyInCol ?? -1;
    if (outCol < 0 && inCol < 0) {
      return {
        signedAmount: 0,
        debitAmount: 0,
        creditAmount: 0,
        direction: 'unknown',
        error: 'money_columns_missing',
      };
    }
    const debit = outCol >= 0 ? parseAmountCell(cells[outCol]) : 0;
    const credit = inCol >= 0 ? parseAmountCell(cells[inCol]) : 0;
    if (Math.abs(debit) > 0.001 && Math.abs(credit) > 0.001) {
      return {
        signedAmount: 0,
        debitAmount: Math.abs(debit),
        creditAmount: Math.abs(credit),
        direction: 'unknown',
        error: 'both_in_and_out',
      };
    }
    if (Math.abs(debit) < 0.001 && Math.abs(credit) < 0.001) {
      return {
        signedAmount: 0,
        debitAmount: 0,
        creditAmount: 0,
        direction: 'unknown',
        error: 'empty_amount',
      };
    }
    // Book: +in, -out  (debit=out, credit=in)
    return pack(signedFromDebitCredit(Math.abs(debit), Math.abs(credit), 'debit_credit'));
  }

  if (rules.mode === 'signed_amount') {
    const col = rules.amountCol ?? -1;
    if (col < 0) {
      return {
        signedAmount: 0,
        debitAmount: 0,
        creditAmount: 0,
        direction: 'unknown',
        error: 'money_columns_missing',
      };
    }
    let signed = parseAmountCell(cells[col]);
    if (!negOut) signed = -signed;
    return pack(signed);
  }

  if (rules.mode === 'amount_with_type') {
    const aCol = rules.amountCol ?? -1;
    const tCol = rules.typeCol ?? -1;
    if (aCol < 0 || tCol < 0) {
      return {
        signedAmount: 0,
        debitAmount: 0,
        creditAmount: 0,
        direction: 'unknown',
        error: 'money_columns_missing',
      };
    }
    const label = String(cells[tCol] ?? '').trim();
    if (isIgnoredLabel(label, rules.ignoreMoneyLabels)) {
      return {
        signedAmount: 0,
        debitAmount: 0,
        creditAmount: 0,
        direction: 'unknown',
        error: 'ignored_money_label',
        unknownLabel: label || '(empty)',
      };
    }
    const kind = classifyToken(label, outTok, inTok);
    if (kind === 'unknown') {
      return {
        signedAmount: 0,
        debitAmount: 0,
        creditAmount: 0,
        direction: 'unknown',
        error: 'unknown_money_label',
        unknownLabel: label || '(empty)',
      };
    }
    // Default: out tokens → Money Out (-), in tokens → Money In (+)
    // If drMeansOut is false, invert
    const abs = Math.abs(parseAmountCell(cells[aCol]));
    let signed = kind === 'out' ? -abs : abs;
    if (!drOut) signed = -signed;
    return pack(signed);
  }

  if (rules.mode === 'embedded_indicator') {
    const col = rules.amountCol ?? -1;
    if (col < 0) {
      return {
        signedAmount: 0,
        debitAmount: 0,
        creditAmount: 0,
        direction: 'unknown',
        error: 'money_columns_missing',
      };
    }
    const raw = String(cells[col] ?? '');
    if (isIgnoredLabel(raw, rules.ignoreMoneyLabels)) {
      return {
        signedAmount: 0,
        debitAmount: 0,
        creditAmount: 0,
        direction: 'unknown',
        error: 'ignored_money_label',
        unknownLabel: raw.slice(0, 40) || '(empty)',
      };
    }
    const upper = raw.toUpperCase();
    let kind: 'out' | 'in' | 'unknown' = 'unknown';
    for (const t of outTok) {
      if (upper.includes(t.toUpperCase())) {
        kind = 'out';
        break;
      }
    }
    if (kind === 'unknown') {
      for (const t of inTok) {
        if (upper.includes(t.toUpperCase())) {
          kind = 'in';
          break;
        }
      }
    }
    // Also detect DR/CR patterns
    if (kind === 'unknown') {
      if (/\bDR\b|\(DR\)|\bDB\b/i.test(raw)) kind = 'out';
      else if (/\bCR\b|\(CR\)/i.test(raw)) kind = 'in';
    }
    if (kind === 'unknown') {
      // Fall back to signed number only
      const n = parseAmountCell(raw);
      if (Math.abs(n) > 0.001) return pack(negOut ? n : -n);
      return {
        signedAmount: 0,
        debitAmount: 0,
        creditAmount: 0,
        direction: 'unknown',
        error: 'unknown_money_label',
        unknownLabel: raw.slice(0, 40) || '(empty)',
      };
    }
    const abs = Math.abs(parseAmountCell(raw));
    let signed = kind === 'out' ? -abs : abs;
    if (!drOut) signed = -signed;
    return pack(signed);
  }

  return {
    signedAmount: 0,
    debitAmount: 0,
    creditAmount: 0,
    direction: 'unknown',
    error: 'money_columns_missing',
  };
}

export function suggestAmountModeFromHeaders(headers: string[]): {
  mode: AmountMode;
  moneyOutCol?: number;
  moneyInCol?: number;
  amountCol?: number;
  typeCol?: number;
} {
  const h = headers.map((x) => x.toLowerCase().trim());
  const find = (keys: string[]) =>
    h.findIndex((cell) => keys.some((k) => cell === k || cell.includes(k)));

  const typeCol = find(['dr/cr', 'dr cr', 'd/c', 'type']);
  const debitCol = find(['debit', 'withdrawal', 'money out', 'paid out']);
  const creditCol = find(['credit', 'deposit', 'money in', 'paid in']);
  const amountCol = find(['amount', 'txn amount', 'transaction amount', 'value']);

  // Prefer separate debit/credit when both exist and not the same as type
  if (debitCol >= 0 && creditCol >= 0 && debitCol !== creditCol) {
    return { mode: 'debit_credit', moneyOutCol: debitCol, moneyInCol: creditCol };
  }
  if (amountCol >= 0 && typeCol >= 0) {
    return { mode: 'amount_with_type', amountCol, typeCol };
  }
  if (amountCol >= 0) {
    return { mode: 'signed_amount', amountCol };
  }
  return { mode: 'debit_credit' };
}
