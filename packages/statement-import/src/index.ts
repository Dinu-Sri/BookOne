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
