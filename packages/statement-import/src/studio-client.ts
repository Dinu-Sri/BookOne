/**
 * Client-safe entry for Import Studio UI.
 * Do not re-export fingerprint / parse / transform (those use node:crypto / xlsx).
 */
export type {
  AmountRules,
  AmountMode,
  AmountInterpretResult,
} from './amount-rules';

export type {
  StudioMapping,
  StudioLine,
  StudioTransformResult,
} from './studio-transform-types';

export type {
  ColumnMap,
  ParseProfile,
  SignConvention,
  CanonicalStatementLine,
  MatchResult,
  BookCandidate,
  ProposedAction,
  StatementDirection,
  SheetPreview,
} from './types';

export {
  collectUnknownMoneyLabels,
  type UnknownLabelIssue,
  type UnknownLabelLine,
} from './unknown-labels';
