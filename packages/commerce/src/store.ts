import type { CatalogBundle } from './catalog';

export type PriceEntryInput = {
  productId: string;
  price: string | null;
  compareAtPrice: string | null;
  salePrice: string | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  tiers: Array<{ minQty: string; price: string }>;
};
import type {
  ActivityRow,
  CommitmentLine,
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
  getOrderById?(tenantId: string, orderId: string): Promise<OrderRow | null>;

  /**
   * Hold stock for an order: all lines or none. Checks on-hand minus active
   * commitments under the per-product stock lock. Returns the shortfall per
   * product when it cannot hold.
   */
  commitStock?(input: {
    tenantId: string;
    connectionId: string;
    orderId: string;
    locationId: string | null;
    lines: CommitmentLine[];
  }): Promise<{ ok: true } | { ok: false; short: Array<{ productId: string; available: number; needed: number }> }>;
  /** Set every active commitment of an order to released or consumed. */
  settleCommitments?(tenantId: string, orderId: string, status: 'released' | 'consumed' | 'active'): Promise<number>;
  /** Active committed quantity for a product at a location. */
  committedQty?(tenantId: string, productId: string, locationId: string | null): Promise<number>;
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

  /** WP1: everything the catalog API needs for one channel. */
  catalogBundle?(tenantId: string, connectionId: string): Promise<CatalogBundle>;
  /** WP1: publish or unpublish products on a channel. Returns rows changed. */
  setChannelProducts?(tenantId: string, connectionId: string, productIds: string[], published: boolean): Promise<number>;
  listChannelProductIds?(tenantId: string, connectionId: string): Promise<string[]>;

  /** WP2 price lists. */
  listPriceLists?(tenantId: string): Promise<Array<{ id: string; name: string; currency: string; customerGroup: string | null; itemCount: number }>>;
  savePriceList?(tenantId: string, input: { id?: string; name: string; currency: string; customerGroup: string | null; archive?: boolean }): Promise<string>;
  upsertPriceEntries?(tenantId: string, priceListId: string, rows: PriceEntryInput[]): Promise<number>;
  /** Products on a list whose sale started or ended in (from, to]. */
  saleBoundaryProductIds?(tenantId: string, priceListId: string, fromIso: string, toIso: string): Promise<string[]>;
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
