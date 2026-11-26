import type {
  ActivityRow,
  ConnectionRow,
  CredentialRow,
  IdempotencyRow,
  MappingProposalRow,
  MappingRow,
  OrderRow,
  OutboxRow,
  ProductRecord,
  PublishClaimRow,
  StockRecord,
} from './types';

export type CommerceStore = {
  insertConnection(row: ConnectionRow): Promise<void>;
  getConnection(tenantId: string, id: string): Promise<ConnectionRow | null>;
  listConnections(tenantId: string): Promise<ConnectionRow[]>;
  updateConnection(row: ConnectionRow): Promise<void>;

  insertCredential(row: CredentialRow): Promise<void>;
  getCredentialByPrefix(prefix: string): Promise<CredentialRow | null>;
  listCredentials(tenantId: string, connectionId: string): Promise<CredentialRow[]>;
  updateCredential(row: CredentialRow): Promise<void>;

  listMappings(tenantId: string, connectionId: string): Promise<MappingRow[]>;
  upsertMapping(row: MappingRow): Promise<void>;
  deleteMapping(tenantId: string, id: string): Promise<void>;

  insertMappingProposal(row: MappingProposalRow): Promise<void>;
  getMappingProposal(tenantId: string, id: string): Promise<MappingProposalRow | null>;
  listMappingProposals(tenantId: string, connectionId: string): Promise<MappingProposalRow[]>;
  updateMappingProposal(row: MappingProposalRow): Promise<void>;

  upsertPublishClaim(row: PublishClaimRow): Promise<void>;
  getPublishClaim(tenantId: string, connectionId: string, bookoneProductId: string): Promise<PublishClaimRow | null>;
  getPublishClaimByKey(tenantId: string, connectionId: string, claimKey: string): Promise<PublishClaimRow | null>;
  listPublishClaims(tenantId: string, connectionId: string): Promise<PublishClaimRow[]>;

  getProduct(tenantId: string, id: string): Promise<ProductRecord | null>;
  findProductBySku(tenantId: string, sku: string): Promise<ProductRecord | null>;
  listSellableProducts(tenantId: string): Promise<ProductRecord[]>;
  getStock(tenantId: string, productId: string, locationId: string | null): Promise<StockRecord | null>;
  listStock(tenantId: string, locationId: string | null): Promise<StockRecord[]>;

  getOrderByExternalId(tenantId: string, connectionId: string, externalId: string): Promise<OrderRow | null>;
  insertOrder(row: OrderRow): Promise<void>;
  updateOrder(row: OrderRow): Promise<void>;
  listOrders(tenantId: string, connectionId?: string, status?: string): Promise<OrderRow[]>;

  getIdempotency(tenantId: string, connectionId: string, key: string): Promise<IdempotencyRow | null>;
  putIdempotency(tenantId: string, connectionId: string, key: string, row: IdempotencyRow): Promise<void>;

  insertEvent(row: CommerceEventRow): Promise<'inserted' | 'duplicate'>;
  getEvent(tenantId: string, connectionId: string, externalEventId: string): Promise<CommerceEventRow | null>;
  /** Events for one order (retry of refused cancels/refunds, QA-1126-18). */
  listOrderEvents?(tenantId: string, connectionId: string, orderId: string): Promise<CommerceEventRow[]>;
  updateEvent(
    id: string,
    patch: { status: string; result?: Record<string, unknown> | null },
  ): Promise<void>;

  insertRefund(row: CommerceRefundRow): Promise<'inserted' | 'duplicate'>;
  getRefund(tenantId: string, connectionId: string, externalRefundId: string): Promise<CommerceRefundRow | null>;
  updateRefund(id: string, patch: { documentId: string | null }): Promise<void>;

  nextRevision(tenantId: string, connectionId: string): Promise<number>;
  insertOutbox(row: OutboxRow & { tenantId: string; connectionId: string }): Promise<void>;
  listOutbox(tenantId: string, connectionId: string, afterRevision: number, limit: number): Promise<OutboxRow[]>;
  maxRevision(tenantId: string, connectionId: string): Promise<number>;

  insertActivity(row: ActivityRow & { tenantId: string }): Promise<void>;
  listActivity(tenantId: string, connectionId?: string): Promise<ActivityRow[]>;
};

export type CommerceEventRow = {
  id: string;
  tenantId: string;
  connectionId: string;
  orderId: string;
  externalEventId: string;
  kind: string;
  status: string;
  sourceVersion: string | null;
  effectiveAt: string;
  amount: string | null;
  restock: boolean;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
};

export type CommerceRefundRow = {
  id: string;
  tenantId: string;
  connectionId: string;
  orderId: string;
  externalRefundId: string;
  amount: string;
  restock: boolean;
  documentId: string | null;
};
