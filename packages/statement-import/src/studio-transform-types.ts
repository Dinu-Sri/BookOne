/**
 * Studio types only — safe for client bundles (no node:crypto / xlsx).
 */
import type { AmountRules } from './amount-rules';
import type { BalanceCheckResult } from './validate-balance';

export type StudioMapping = {
  sheetName?: string;
  headerRowIndex: number;
  dateCol: number;
  descriptionCol: number;
  /** Optional second description columns joined with " | " */
  descriptionExtraCols?: number[];
  balanceCol?: number | null;
  amountRules: AmountRules;
  /** Opening/closing if user/system set */
  openingBalance?: number | null;
  closingBalance?: number | null;
  /** Prefer DD/MM when ambiguous */
  dayFirst?: boolean;
};

export type StudioLine = {
  rowNumber: number;
  date: string;
  dateConfidence: number;
  description: string;
  signedAmount: number;
  debitAmount: number;
  creditAmount: number;
  direction: 'in' | 'out' | 'unknown';
  balanceAfter?: number;
  fingerprint: string;
  sourceRowHash: string;
  validationStatus: 'valid' | 'warning' | 'error' | 'excluded';
  validationMessages: string[];
  raw: Record<string, unknown>;
  unknownLabel?: string;
};

export type StudioTransformResult = {
  lines: StudioLine[];
  headers: string[];
  headerRowIndex: number;
  totals: {
    totalMoneyIn: number;
    totalMoneyOut: number;
    transactionCount: number;
    periodFrom: string | null;
    periodTo: string | null;
  };
  balanceCheck: BalanceCheckResult;
  issues: {
    type: string;
    severity: 'error' | 'warning';
    title: string;
    count: number;
    sample?: string;
  }[];
  readyCount: number;
  errorCount: number;
  warningCount: number;
  excludedCount: number;
  samplePreview: StudioLine[];
};
