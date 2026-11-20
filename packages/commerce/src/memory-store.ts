import { randomUUID } from 'node:crypto';
import type { CommerceEventRow, CommerceRefundRow, CommerceStore } from './store';
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

export class MemoryCommerceStore implements CommerceStore {
  connections: ConnectionRow[] = [];
  credentials: CredentialRow[] = [];
  mappings: MappingRow[] = [];
  proposals: MappingProposalRow[] = [];
  claims: PublishClaimRow[] = [];
  products: ProductRecord[] = [];
  stock: StockRecord[] = [];
  orders: OrderRow[] = [];
  idem = new Map<string, IdempotencyRow>();
  events: CommerceEventRow[] = [];
  refunds: CommerceRefundRow[] = [];
  outbox: Array<OutboxRow & { tenantId: string; connectionId: string }> = [];
  activity: Array<ActivityRow & { tenantId: string }> = [];
  revisions = new Map<string, number>();

  seedProduct(product: ProductRecord, stock: StockRecord) {
    this.products.push(product);
    this.stock.push(stock);
  }

  async insertConnection(row: ConnectionRow) {
    this.connections.push(row);
  }
  async getConnection(tenantId: string, id: string) {
    return this.connections.find((c) => c.tenantId === tenantId && c.id === id) ?? null;
  }
  async listConnections(tenantId: string) {
    return this.connections.filter((c) => c.tenantId === tenantId);
  }
  async updateConnection(row: ConnectionRow) {
    const i = this.connections.findIndex((c) => c.id === row.id);
    if (i >= 0) this.connections[i] = row;
  }
  async insertCredential(row: CredentialRow) {
    this.credentials.push(row);
  }
  async getCredentialByPrefix(prefix: string) {
    return this.credentials.find((c) => c.prefix === prefix) ?? null;
  }
  async listCredentials(tenantId: string, connectionId: string) {
    return this.credentials.filter((c) => c.tenantId === tenantId && c.connectionId === connectionId);
  }
  async updateCredential(row: CredentialRow) {
    const i = this.credentials.findIndex((c) => c.id === row.id);
    if (i >= 0) this.credentials[i] = row;
  }
  async listMappings(tenantId: string, connectionId: string) {
    return this.mappings.filter((m) => m.tenantId === tenantId && m.connectionId === connectionId);
  }
  async upsertMapping(row: MappingRow) {
    const i = this.mappings.findIndex(
      (m) => m.tenantId === row.tenantId && m.connectionId === row.connectionId && m.bookoneProductId === row.bookoneProductId,
    );
    if (i >= 0) this.mappings[i] = row;
    else this.mappings.push(row);
  }
  async deleteMapping(tenantId: string, id: string) {
    this.mappings = this.mappings.filter((m) => !(m.tenantId === tenantId && m.id === id));
  }
  async insertMappingProposal(row: MappingProposalRow) {
    this.proposals.push(structuredClone(row));
  }
  async getMappingProposal(tenantId: string, id: string) {
    return this.proposals.find((p) => p.tenantId === tenantId && p.id === id) ?? null;
  }
  async listMappingProposals(tenantId: string, connectionId: string) {
    return this.proposals
      .filter((p) => p.tenantId === tenantId && p.connectionId === connectionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async updateMappingProposal(row: MappingProposalRow) {
    const i = this.proposals.findIndex((p) => p.id === row.id);
    if (i >= 0) this.proposals[i] = structuredClone(row);
  }
  async upsertPublishClaim(row: PublishClaimRow) {
    const i = this.claims.findIndex(
      (c) => c.tenantId === row.tenantId && c.connectionId === row.connectionId && c.bookoneProductId === row.bookoneProductId,
    );
    if (i >= 0) this.claims[i] = structuredClone(row);
    else this.claims.push(structuredClone(row));
  }
  async getPublishClaim(tenantId: string, connectionId: string, bookoneProductId: string) {
    return (
      this.claims.find(
        (c) => c.tenantId === tenantId && c.connectionId === connectionId && c.bookoneProductId === bookoneProductId,
      ) ?? null
    );
  }
  async getPublishClaimByKey(tenantId: string, connectionId: string, claimKey: string) {
    return (
      this.claims.find((c) => c.tenantId === tenantId && c.connectionId === connectionId && c.claimKey === claimKey) ?? null
    );
  }
  async listPublishClaims(tenantId: string, connectionId: string) {
    return this.claims.filter((c) => c.tenantId === tenantId && c.connectionId === connectionId);
  }
  async getProduct(tenantId: string, id: string) {
    void tenantId;
    return this.products.find((p) => p.id === id) ?? null;
  }
  async findProductBySku(tenantId: string, sku: string) {
    void tenantId;
    return this.products.find((p) => p.sku === sku) ?? null;
  }
  async listSellableProducts(tenantId: string) {
    void tenantId;
    return this.products;
  }
  async getStock(tenantId: string, productId: string, locationId: string | null) {
    void tenantId;
    return this.stock.find((s) => s.productId === productId && (s.locationId ?? null) === (locationId ?? null)) ?? null;
  }
  async listStock(tenantId: string, locationId: string | null) {
    void tenantId;
    return this.stock.filter((s) => (s.locationId ?? null) === (locationId ?? null));
  }
  async getOrderByExternalId(tenantId: string, connectionId: string, externalId: string) {
    return this.orders.find((o) => o.tenantId === tenantId && o.connectionId === connectionId && o.externalId === externalId) ?? null;
  }
  async insertOrder(row: OrderRow) {
    this.orders.push(structuredClone(row));
  }
  async updateOrder(row: OrderRow) {
    const i = this.orders.findIndex((o) => o.id === row.id);
    if (i >= 0) this.orders[i] = structuredClone(row);
  }
  async listOrders(tenantId: string, connectionId?: string, status?: string) {
    return this.orders.filter(
      (o) => o.tenantId === tenantId && (!connectionId || o.connectionId === connectionId) && (!status || o.status === status),
    );
  }
  idempKey(tenantId: string, connectionId: string, key: string) {
    return `${tenantId}:${connectionId}:${key}`;
  }
  async getIdempotency(tenantId: string, connectionId: string, key: string) {
    return this.idem.get(this.idempKey(tenantId, connectionId, key)) ?? null;
  }
  async putIdempotency(tenantId: string, connectionId: string, key: string, row: IdempotencyRow) {
    this.idem.set(this.idempKey(tenantId, connectionId, key), row);
  }
  async insertEvent(row: CommerceEventRow) {
    if (await this.getEvent(row.tenantId, row.connectionId, row.externalEventId)) return 'duplicate';
    this.events.push({ ...row, payload: { ...row.payload }, result: row.result ? { ...row.result } : null });
    return 'inserted';
  }
  async getEvent(tenantId: string, connectionId: string, externalEventId: string) {
    return (
      this.events.find(
        (e) => e.tenantId === tenantId && e.connectionId === connectionId && e.externalEventId === externalEventId,
      ) ?? null
    );
  }
  async updateEvent(id: string, patch: { status: string; result?: Record<string, unknown> | null }) {
    const row = this.events.find((e) => e.id === id);
    if (!row) return;
    row.status = patch.status;
    if (patch.result !== undefined) row.result = patch.result;
  }
  async insertRefund(row: CommerceRefundRow) {
    if (await this.getRefund(row.tenantId, row.connectionId, row.externalRefundId)) return 'duplicate';
    this.refunds.push({ ...row });
    return 'inserted';
  }
  async getRefund(tenantId: string, connectionId: string, externalRefundId: string) {
    return (
      this.refunds.find(
        (r) => r.tenantId === tenantId && r.connectionId === connectionId && r.externalRefundId === externalRefundId,
      ) ?? null
    );
  }
  async updateRefund(id: string, patch: { documentId: string | null }) {
    const row = this.refunds.find((r) => r.id === id);
    if (row) row.documentId = patch.documentId;
  }
  async nextRevision(tenantId: string, connectionId: string) {
    const key = `${tenantId}:${connectionId}`;
    const n = (this.revisions.get(key) ?? 0) + 1;
    this.revisions.set(key, n);
    return n;
  }
  async insertOutbox(row: OutboxRow & { tenantId: string; connectionId: string }) {
    this.outbox.push(row);
  }
  async listOutbox(tenantId: string, connectionId: string, afterRevision: number, limit: number) {
    return this.outbox
      .filter((r) => r.tenantId === tenantId && r.connectionId === connectionId && r.revision > afterRevision)
      .sort((a, b) => a.revision - b.revision)
      .slice(0, limit);
  }
  async maxRevision(tenantId: string, connectionId: string) {
    return this.revisions.get(`${tenantId}:${connectionId}`) ?? 0;
  }
  async insertActivity(row: ActivityRow & { tenantId: string }) {
    this.activity.push({ ...row, id: row.id || randomUUID() });
  }
  async listActivity(tenantId: string, connectionId?: string) {
    return this.activity.filter((a) => a.tenantId === tenantId && (!connectionId || a.connectionId === connectionId));
  }
}
