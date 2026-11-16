import { DEFAULT_CURRENCY, type Money } from './money';

export const SCHEMA_VERSION = 'ab-02.1';
export const POLICY_VERSION = 'ab-01.purchase-bill.unpaid-service.v1';
export const MCP_PROTOCOL_VERSION = '2025-03-26';
export const API_VERSION = 'v1';

export const DOCUMENT_STATES = [
  'received',
  'extracting',
  'needs_clarification',
  'draft',
  'validated',
  'awaiting_approval',
  'posting',
  'posted',
  'rejected',
  'failed',
  'unknown_outcome',
] as const;
export type DocumentState = (typeof DOCUMENT_STATES)[number];

export const CAPABILITIES = ['read', 'upload', 'draft', 'approve', 'post'] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type ObservedInferred<T> = {
  value: T;
  origin: 'observed' | 'inferred' | 'user';
  page?: number;
  field?: string;
  confidence?: number;
};

export type ExtractedFacts = {
  supplierName?: ObservedInferred<string>;
  supplierInvoiceNumber?: ObservedInferred<string>;
  issueDate?: ObservedInferred<string>;
  currency?: ObservedInferred<string>;
  paidStatus?: ObservedInferred<'unpaid' | 'paid' | 'part_paid' | 'unknown'>;
  documentKind?: ObservedInferred<'service_expense' | 'stock' | 'mixed' | 'unknown'>;
  net?: ObservedInferred<Money>;
  tax?: ObservedInferred<Money>;
  gross?: ObservedInferred<Money>;
  lineDescription?: ObservedInferred<string>;
  rawText?: string;
};

export type CompanyPolicy = {
  currency: string;
  vatRegistered: boolean;
  vatRatePercent: number;
  jurisdiction: string;
  defaultExpenseAccount: string;
  payableAccount: string;
  inputVatAccount: string;
  approvedSuppliers: { name: string; partyId?: string }[];
  approvedCategories: { label: string; accountCode: string }[];
  policyVersion: string;
  effectiveDate: string;
};

export type ProposalFacts = {
  supplierName: string;
  supplierInvoiceNumber: string;
  issueDate: string;
  currency: string;
  paidStatus: 'unpaid' | 'paid' | 'part_paid' | 'unknown';
  documentKind: 'service_expense' | 'stock' | 'mixed' | 'unknown';
  expenseAccountCode: string;
  categoryLabel: string;
  invoiceKind: 'commercial' | 'tax_invoice';
  net: Money;
  tax: Money;
  gross: Money;
  lineDescription: string;
};

export type IssueCode =
  | 'MISSING_SUPPLIER'
  | 'UNKNOWN_SUPPLIER'
  | 'MISSING_INVOICE_NUMBER'
  | 'MISSING_DATE'
  | 'AMBIGUOUS_DATE'
  | 'CURRENCY_MISMATCH'
  | 'AMBIGUOUS_CURRENCY'
  | 'CONFLICTING_TOTALS'
  | 'UNSUPPORTED_PAID'
  | 'UNSUPPORTED_STOCK'
  | 'UNSUPPORTED_MIXED'
  | 'MISSING_CATEGORY'
  | 'AMBIGUOUS_CATEGORY'
  | 'MISSING_TAX_POLICY'
  | 'DUPLICATE_SCAN'
  | 'DUPLICATE_BUSINESS'
  | 'FEATURE_DISABLED'
  | 'POSTING_DISABLED'
  | 'DRAFT_ONLY'
  | 'STALE_REVISION'
  | 'EXPIRED_APPROVAL'
  | 'PERMISSION_DENIED'
  | 'PERIOD_LOCKED'
  | 'IDEMPOTENCY_MISMATCH'
  | 'MALICIOUS_INSTRUCTION_IGNORED'
  | 'EXTRACTION_FAILED'
  | 'PROVIDER_UNCONFIGURED'
  | 'ATTACHMENT_REJECTED'
  | 'HUMAN_APPROVAL_REQUIRED'
  | 'TOKEN_INVALID'
  | 'CONNECTION_REVOKED'
  | 'UNKNOWN_OUTCOME';

export type Issue = {
  id: string;
  code: IssueCode;
  fieldPath: string;
  message: string;
  question: string;
  allowedResolutions: string[];
  ruleRef: string;
  blocking: boolean;
};

export type ClarificationAnswer = {
  issueId: string;
  value: string;
  actorUserId: string;
};

export type PreviewEffect = {
  schemaVersion: string;
  policyVersion: string;
  previewVersion: string;
  documentType: 'purchase';
  invoiceKind: 'commercial' | 'tax_invoice';
  net: Money;
  discount: Money;
  vat: Money;
  gross: Money;
  expenseAccount: string;
  payableAccount: string;
  inputVatAccount: string | null;
  journal: { accountCode: string; side: 'debit' | 'credit'; minor: number; memo: string }[];
  plainLanguage: string;
  sourceRefs: string[];
};

export type ApprovalRecord = {
  id: string;
  proposalId: string;
  proposalHash: string;
  previewVersion: string;
  policyVersion: string;
  actorUserId: string;
  tenantId: string;
  grantedAt: string;
  expiresAt: string;
  revokedAt?: string;
};

export type OperationReceipt = {
  operationId: string;
  idempotencyKey: string;
  status: 'posting' | 'posted' | 'failed' | 'unknown_outcome';
  billId?: string;
  documentNumber?: string;
  journalMemo?: string;
  postedAt?: string;
  error?: string;
};

export type Actor = {
  userId: string;
  tenantId: string;
  capabilities: Capability[];
  connectionId?: string;
  clientId?: string;
  /** Display name of a trusted human approver when known. */
  displayName?: string;
};

export type FeatureFlags = {
  enabled: boolean;
  draftOnly: boolean;
  postingDisabled: boolean;
};

export const DEFAULT_FLAGS: FeatureFlags = {
  enabled: false,
  draftOnly: true,
  postingDisabled: true,
};

export function defaultPolicy(over: Partial<CompanyPolicy> = {}): CompanyPolicy {
  return {
    currency: DEFAULT_CURRENCY,
    vatRegistered: true,
    vatRatePercent: 18,
    jurisdiction: 'LK',
    defaultExpenseAccount: '6800',
    payableAccount: '2100',
    inputVatAccount: '2300',
    approvedSuppliers: [{ name: 'ABC Supplies' }, { name: 'Office Mart' }],
    approvedCategories: [
      { label: 'Office expenses', accountCode: '6800' },
      { label: 'Utilities', accountCode: '6400' },
    ],
    policyVersion: POLICY_VERSION,
    effectiveDate: '2026-01-01',
    ...over,
  };
}
