/** Canonical bank statement line after normalize (GL-ready staging). */

export type StatementDirection = 'in' | 'out' | 'unknown';
export type ProposedAction = 'link' | 'create' | 'skip' | 'review' | 'duplicate';
export type MatchMethod = 'exact' | 'fuzzy' | 'manual' | 'none';
/**
 * signed_amount — single amount column (may already be signed)
 * debit_credit — separate Debit (out) / Credit (in) columns
 * credit_debit — inverted bank convention (rare)
 * amount_with_type — Amount + DR/CR (or D/C) type column (Sampath Vishwa style)
 */
export type SignConvention =
  | 'signed_amount'
  | 'debit_credit'
  | 'credit_debit'
  | 'amount_with_type';

export type ColumnMap = {
  date?: number | string;
  description?: number | string;
  amount?: number | string;
  debit?: number | string;
  credit?: number | string;
  balance?: number | string;
  ref?: number | string;
  /** DR/CR / D/C / Debit/Credit flag column (with amount_with_type) */
  type?: number | string;
};

export type ParseProfile = {
  name: string;
  bankHint?: string;
  columnMap: ColumnMap;
  signConvention: SignConvention;
  dateFormatHint?: string;
  skipRows?: number;
  sheetName?: string;
};

export type CanonicalStatementLine = {
  rowNumber: number;
  date: string;
  description: string;
  /** Book convention: positive = money in, negative = money out */
  amountSigned: number;
  direction: StatementDirection;
  balanceAfter?: number;
  externalRef?: string;
  fingerprint: string;
  dateConfidence: number;
  raw: Record<string, unknown>;
};

export type BookCandidate = {
  id: string;
  date: string;
  description: string;
  /** Same sign convention as bank line */
  amountSigned: number;
  paymentAccountCode?: string | null;
};

export type MatchResult = {
  line: CanonicalStatementLine;
  proposedAction: ProposedAction;
  matchScore: number;
  matchMethod: MatchMethod;
  matchedTransactionId: string | null;
  candidates: { id: string; score: number }[];
  confidence: number;
};

export type ParseResult = {
  lines: CanonicalStatementLine[];
  profile: ParseProfile;
  profileAuto: boolean;
  warnings: string[];
  periodFrom: string | null;
  periodTo: string | null;
  headerRowIndex: number;
};

/** Raw matrix preview for manual mapping UI */
export type SheetPreview = {
  sheetNames: string[];
  sheetName: string;
  /** First N non-empty rows as strings */
  rows: string[][];
  maxColumns: number;
  suggested: ParseProfile;
  headerRowIndex: number;
};
