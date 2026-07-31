export type {
  CanonicalStatementLine,
  ColumnMap,
  ParseProfile,
  ParseResult,
  MatchResult,
  BookCandidate,
  ProposedAction,
  StatementDirection,
  SignConvention,
  SheetPreview,
} from './types';

export { parseStatementFile, previewStatementSheet } from './parse';
export {
  parseStatementDate,
  parseAmountCell,
  signedFromDebitCredit,
  signedFromAmountAndType,
  directionFromSigned,
} from './normalize';
export { lineFingerprint, fileSha256, normalizeDescription } from './fingerprint';
export { matchLine, matchAll } from './match';
export { detectHeaderAndMap, GENERIC_PROFILES, FIELD_LABELS } from './templates';
export { annotateBalanceContinuity, type ContinuityFlag } from './balance';
export {
  SL_BANK_PRESETS,
  applyPresetToHeaders,
  getPreset,
  listPresetsForUi,
  suggestPresetFromBankName,
  type SlBankPreset,
  type SlBankPresetId,
} from './sl-bank-presets';
export { inspectStatementFile, type FileInspection, type InspectSheet } from './inspect';
export {
  checkStatementBalance,
  totalsFromSignedAmounts,
  type StatementTotals,
  type BalanceCheckResult,
} from './validate-balance';
export {
  interpretAmount,
  suggestAmountModeFromHeaders,
  mergeAmountTokens,
  DEFAULT_MONEY_OUT_TOKENS,
  DEFAULT_MONEY_IN_TOKENS,
  type AmountRules,
  type AmountMode,
  type AmountInterpretResult,
} from './amount-rules';
export {
  loadWorkbookMatrix,
  suggestStudioMapping,
  transformStudioMatrix,
  listColumns,
  columnSamples,
  type StudioMapping,
  type StudioLine,
  type StudioTransformResult,
} from './studio-transform';
export {
  collectUnknownMoneyLabels,
  type UnknownLabelIssue,
  type UnknownLabelLine,
} from './unknown-labels';
export {
  assertWorkbookReadable,
  looksPasswordProtectedExcel,
  friendlyWorkbookError,
} from './file-safety';
export {
  dateRangesOverlap,
  gapDaysBetween,
  buildOverlapReport,
  type DateRange,
  type OverlapReport,
} from './overlap';
