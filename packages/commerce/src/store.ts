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

  /** WP3 reservations. */
  insertReservation?(row: ReservationRow): Promise<void>;
  getReservation?(tenantId: string, id: string): Promise<ReservationRow | null>;
  updateReservation?(row: ReservationRow): Promise<void>;
  listReservations?(tenantId: string, connectionId: string | null, status?: string): Promise<ReservationRow[]>;
  /**
   * Hold stock for a reservation under the per-product lock. All-or-nothing
   * unless `partial`. Returns what each product could hold.
   */
  holdReservation?(input: {
    tenantId: string;
    connectionId: string;
    reservationId: string;
    locationId: string | null;
    expiresAt: string;
    partial: boolean;
    lines: Array<{ productId: string; quantity: number }>;
  }): Promise<{ ok: boolean; lines: Array<{ productId: string; needed: number; available: number; held: number }> }>;
  /** Set a reservation's active holds to released (or consumed). */
  releaseReservationHolds?(tenantId: string, reservationId: string, status: 'released' | 'consumed'): Promise<number>;
  extendReservationHolds?(tenantId: string, reservationId: string, expiresAt: string): Promise<number>;
  /** Move a reservation's holds onto an order (no expiry) — the order then owns them. */
  transferReservationToOrder?(tenantId: string, reservationId: string, orderId: string): Promise<number>;

  /** WP4 webhooks. */
  listWebhooks?(tenantId: string, connectionId: string | null): Promise<WebhookRow[]>;
  insertWebhook?(row: WebhookRow): Promise<void>;
  updateWebhook?(row: WebhookRow): Promise<void>;
  insertDeliveries?(rows: DeliveryRow[]): Promise<void>;
  listDueDeliveries?(tenantId: string, nowIso: string, limit: number): Promise<DeliveryRow[]>;
  updateDelivery?(row: DeliveryRow): Promise<void>;
  listDeliveries?(tenantId: string, webhookId: string, limit: number): Promise<DeliveryRow[]>;

  /** WP6 channel customers. */
  getCustomer?(tenantId: string, connectionId: string, match: { id?: string; channelCustomerId?: string }): Promise<CustomerRow | null>;
  upsertCustomer?(row: CustomerRow): Promise<void>;

  /** WP7 API call log and sales stats. */
  insertApiCall?(row: ApiCallRow): Promise<void>;
  listApiCalls?(tenantId: string, connectionId: string, limit: number): Promise<ApiCallRow[]>;
  /** Units sold per product (all channels incl. POS) over 30 / 90 days and all time. */
  salesStats?(tenantId: string, productIds: string[]): Promise<Map<string, { d30: number; d90: number; all: number }>>;
  /** WP3: reorder level and open purchase orders per product. */
  stockExtras?(tenantId: string, productIds: string[]): Promise<Map<string, { lowStockThreshold: number | null; incoming: Array<{ quantity: number; expectedAt: string | null }> }>>;
  /** Products most often sold on the same documents as this one. */
  relatedProductIds?(tenantId: string, productId: string, limit: number): Promise<string[]>;
};

export type ReservationLine = {
  sku: string;
  productId: string | null;
  quantity: string;
  held: string;
  available: string;
  status: 'held' | 'insufficient' | 'unknown_sku';
};

export type ReservationRow = {
  id: string;
  tenantId: string;
  connectionId: string;
  externalId: string;
  status: 'active' | 'converted' | 'released' | 'expired';
  locationId: string | null;
  partial: boolean;
  lines: ReservationLine[];
  orderId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type WebhookRow = {
  id: string;
  tenantId: string;
  connectionId: string;
  url: string;
  kinds: string[];
  secretEnc: string;
  previousSecretEnc: string | null;
  previousExpiresAt: string | null;
  status: 'active' | 'failing' | 'disabled';
  lastRevision: number;
  failingSince: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  createdAt: string;
  voided?: boolean;
};

export type DeliveryRow = {
  id: string;
  tenantId: string;
  webhookId: string;
  itemId: string;
  revision: number;
  kind: string;
  body: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  nextAttemptAt: string;
  firstAttemptAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

export type CustomerRow = {
  id: string;
  tenantId: string;
  connectionId: string;
  channelCustomerId: string;
  partyId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  addresses: Array<Record<string, unknown>>;
  marketingOptIn: boolean;
  customerGroup: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiCallRow = {
  id: string;
  tenantId: string;
  connectionId: string;
  keyPrefix: string | null;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId: string | null;
  createdAt: string;
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
