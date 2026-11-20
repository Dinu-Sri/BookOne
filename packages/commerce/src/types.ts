export const COMMERCE_API_VERSION = 'v1';
export const COMMERCE_PLUGIN_VERSION = '1.2.0';
export const COMMERCE_SCOPES = ['catalog', 'inventory', 'order', 'lifecycle'] as const;
export type CommerceScope = (typeof COMMERCE_SCOPES)[number];

export const CONNECTION_KINDS = ['woocommerce', 'custom_website'] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

export const ENVIRONMENTS = ['sandbox', 'live'] as const;
export type CommerceEnvironment = (typeof ENVIRONMENTS)[number];

export type PostingMode = 'preview' | 'posting';
export type OversellPolicy = 'review';
export type ReservationMode = 'disabled';

export type OrderStatus =
  | 'received'
  | 'needs_review'
  | 'accepted'
  | 'posted'
  | 'paid'
  | 'cancelled'
  | 'fulfilled'
  | 'refunded'
  | 'partially_refunded'
  | 'failed';

export type PaymentStatus = 'pending' | 'paid' | 'failed';

export type OrderEventKind = 'paid' | 'cancelled' | 'fulfilled' | 'refunded';

export type CommerceActor = {
  tenantId: string;
  connectionId: string;
  credentialId: string;
  userId: string;
  locationId: string | null;
  currency: string;
  environment: CommerceEnvironment;
  kind: ConnectionKind;
  scopes: CommerceScope[];
  postingMode: PostingMode;
  inboundPaused: boolean;
  outboundPaused: boolean;
  oversellPolicy: OversellPolicy;
  reservationMode: ReservationMode;
  prefix: string;
};

export type OperatorActor = {
  tenantId: string;
  userId: string;
  canWrite: boolean;
};

export type OrderLineInput = {
  externalLineId: string;
  sku: string;
  quantity: string;
  unitPrice: string;
  taxAmount?: string;
  discountAmount?: string;
  description?: string;
};

export type OrderInput = {
  externalId: string;
  currency: string;
  placedAt: string;
  sourceTimezone?: string;
  sourceVersion?: string;
  customer: { name: string; email?: string; phone?: string };
  lines: OrderLineInput[];
  shippingAmount?: string;
  discountAmount?: string;
  taxAmount?: string;
  total: string;
  payment?: { status: PaymentStatus; method?: string; amount?: string; externalRef?: string };
  status?: 'pending' | 'paid' | 'cancelled';
};

export type OrderEventInput = {
  externalEventId: string;
  kind: OrderEventKind;
  sourceVersion?: string;
  effectiveAt: string;
  amount?: string;
  restock?: boolean;
  externalRefundId?: string;
  lines?: Array<{ externalLineId: string; quantity?: string; amount?: string }>;
};

export type MappingInput = {
  bookoneProductId: string;
  sku: string;
  externalProductId: string;
  externalVariantId?: string;
  optedInFields?: string[];
};

export type MappingObservationOrigin = 'agent' | 'verified_store';
export type MappingMatchKind =
  | 'suggested'
  | 'unchanged'
  | 'ambiguous'
  | 'missing'
  | 'conflicting'
  | 'unsupported';

export type MappingObservation = {
  sku?: string;
  name?: string;
  externalProductId: string;
  externalVariantId?: string;
  origin: MappingObservationOrigin;
};

export type MappingPreviewRow = {
  sku: string;
  bookoneProductId: string | null;
  bookoneName: string | null;
  externalProductId: string;
  externalVariantId: string;
  kind: MappingMatchKind;
  reason: string;
  origin: MappingObservationOrigin;
  before?: { bookoneProductId: string; externalProductId: string; externalVariantId: string } | null;
};

export type MappingProposalStatus = 'proposed' | 'approved' | 'applied' | 'rejected' | 'stale';

export type MappingProposalRow = {
  id: string;
  tenantId: string;
  connectionId: string;
  createdByUserId: string;
  origin: MappingObservationOrigin;
  status: MappingProposalStatus;
  expectedRevision: number;
  items: MappingPreviewRow[];
  receipt: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type PublishClaimStatus = 'claimed' | 'created' | 'acknowledged' | 'conflict' | 'failed';

export type PublishClaimRow = {
  id: string;
  tenantId: string;
  connectionId: string;
  bookoneProductId: string;
  sku: string;
  claimKey: string;
  status: PublishClaimStatus;
  externalProductId: string;
  externalVariantId: string;
  issue: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CatalogCandidate = {
  claimId: string;
  bookoneProductId: string;
  sku: string;
  name: string;
  unit: string;
  sellPrice: string;
  status: PublishClaimStatus;
  alreadyLinked: boolean;
};

export type AcknowledgementItem = {
  bookoneProductId: string;
  claimId?: string;
  externalProductId: string;
  externalVariantId?: string;
};

export type ProductRecord = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  productType: string;
  isActive: boolean;
  archived: boolean;
  sellPrice: string;
  revision: number;
};

export type StockRecord = {
  productId: string;
  sku: string;
  locationId: string | null;
  quantity: string;
  revision: number;
  asOf: string;
  stale: boolean;
};

export type PostedDocument = {
  documentId: string;
  documentNumber: string;
  settled?: boolean;
};

export type InvoicePostLine = {
  productId: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
};

export type ReturnPostLine = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
};

export type PostingPort = {
  postSalesInvoice(input: {
    actor: CommerceActor;
    order: OrderInput;
    lines: InvoicePostLine[];
    headerDiscount?: number;
    freightAmount?: number;
    invoiceKind?: 'commercial' | 'tax_invoice';
    paymentAccountCode?: string;
    idempotencyKey: string;
    locationId: string | null;
    issueDate: string;
  }): Promise<PostedDocument>;
  postSalesReturn(input: {
    actor: CommerceActor;
    sourceDocumentId: string;
    idempotencyKey: string;
    issueDate: string;
    restock: boolean;
    amount: number;
    lines: ReturnPostLine[];
  }): Promise<PostedDocument>;
};

export type ConnectionRow = {
  id: string;
  tenantId: string;
  createdByUserId: string;
  name: string;
  kind: ConnectionKind;
  environment: CommerceEnvironment;
  locationId: string | null;
  currency: string;
  postingMode: PostingMode;
  inboundPaused: boolean;
  outboundPaused: boolean;
  oversellPolicy: OversellPolicy;
  reservationMode: ReservationMode;
  matchingPolicy: string;
  taxMode: string;
  status: 'active' | 'disconnected';
  lastCatalogSyncAt: string | null;
  lastStockSyncAt: string | null;
  lastOrderSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CredentialRow = {
  id: string;
  tenantId: string;
  connectionId: string;
  createdByUserId: string;
  prefix: string;
  secretHash: string;
  scopes: CommerceScope[];
  status: 'active' | 'rotated' | 'revoked';
  expiresAt: string | null;
  lastUsedAt: string | null;
  rotatedFromId: string | null;
  createdAt: string;
};

export type MappingRow = {
  id: string;
  tenantId: string;
  connectionId: string;
  bookoneProductId: string;
  sku: string;
  externalProductId: string;
  externalVariantId: string;
  status: string;
  optedInFields: string[];
};

export type OrderRow = {
  id: string;
  tenantId: string;
  connectionId: string;
  externalId: string;
  status: OrderStatus;
  reviewReason: string | null;
  currency: string;
  total: string;
  payloadHash: string;
  snapshot: OrderInput;
  sourceVersion: string | null;
  sourceTimezone: string | null;
  placedAt: string;
  documentId: string | null;
  documentNumber: string | null;
  lastAppliedVersion: string | null;
  createdAt: string;
  updatedAt: string;
  lines: Array<{
    id: string;
    externalLineId: string;
    sku: string;
    bookoneProductId: string | null;
    quantity: string;
    unitPrice: string;
    taxAmount: string;
    discountAmount: string;
    restockedQty: string;
    refundedAmount: string;
  }>;
};

export type IdempotencyRow = {
  payloadHash: string;
  orderId: string | null;
  receipt: Record<string, unknown>;
};

export type OutboxRow = {
  id: string;
  revision: number;
  kind: string;
  productId: string | null;
  sku: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ActivityRow = {
  id: string;
  connectionId: string | null;
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};
