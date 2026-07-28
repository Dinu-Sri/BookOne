/** Canonical bank statement line after normalize (GL-ready staging). */

export type StatementDirection = 'in' | 'out' | 'unknown';
export type ProposedAction = 'link' | 'create' | 'skip' | 'review' | 'duplicate';
export type MatchMethod = 'exact' | 'fuzzy' | 'manual' | 'none';
export type SignConvention = 'signed_amount' | 'debit_credit' | 'credit_debit';

export type ColumnMap = {
  date?: number | string;
  description?: number | string;
  amount?: number | string;
  debit?: number | string;
  credit?: number | string;
  balance?: number | string;
  ref?: number | string;
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
