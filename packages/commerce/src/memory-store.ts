import type { PriceEntryInput } from './store';
import type { CatalogBundle } from './catalog';
import { randomUUID } from 'node:crypto';
import type { ApiCallRow, CommerceEventRow, CommerceRefundRow, CommerceStore, CustomerRow, DeliveryRow, ReservationRow, WebhookRow } from './store';
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
  /** WP1 test catalog: raw rows override seeded products; plus images, categories, brands. */
  catalog: Omit<CatalogBundle, 'mapped' | 'onHand' | 'committed' | 'currency' | 'channel' | 'published'> & { published: Set<string> } = {
    products: [],
    images: [],
    categories: [],
    brands: [],
    attributes: [],
    vatRatePercent: 18,
    vatRegistered: false,
    published: new Set(),
    priceLists: [],
  };
  commitments: Array<{
    tenantId: string;
    orderId: string | null;
    reservationId?: string | null;
    expiresAt?: string | null;
    productId: string;
    locationId: string | null;
    quantity: number;
    status: string;
  }> = [];
  reservations: ReservationRow[] = [];
  webhooks: WebhookRow[] = [];
  deliveries: DeliveryRow[] = [];
  customers: CustomerRow[] = [];
  apiCalls: ApiCallRow[] = [];
  /** Test hook: units sold per product id. */
  sold = new Map<string, { d30: number; d90: number; all: number }>();
  /** Test hook: wall clock for expiry. */
  now = () => Date.now();
  private live(c: { status: string; expiresAt?: string | null }) {
    return c.status === 'active' && (!c.expiresAt || Date.parse(c.expiresAt) > this.now());
  }
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
  async catalogBundle(tenantId: string, connectionId: string): Promise<CatalogBundle> {
    const connection = await this.getConnection(tenantId, connectionId);
    const loc = connection?.locationId ?? null;
    const mappings = await this.listMappings(tenantId, connectionId);
    const raw = new Map(this.catalog.products.map((p) => [p.id, p]));
    for (const p of this.products.values()) {
      if (raw.has(p.id)) continue;
      raw.set(p.id, {
        id: p.id, sku: p.sku, name: p.name, shortName: null, description: null, longDescription: null,
        productType: p.productType, unit: p.unit, sellPrice: p.sellPrice, categoryId: null, productBrandId: null,
        barcode: null, extraBarcodes: [], tags: [], attributeValues: [], weightGrams: null, lengthMm: null,
        widthMm: null, heightMm: null, fragile: false, taxStatus: 'standard', minOrderQty: null, maxOrderQty: null,
        orderQtyStep: null, allowBackorder: false, parentProductId: null, variantOptions: [], productOptions: [],
        swatchHex: null, variantSortOrder: 0, isDefaultVariant: false, sellable: true, isActive: p.isActive,
        archived: p.archived, imageKey: null, createdAt: new Date(0).toISOString(), updatedAt: new Date(p.revision * 1000).toISOString(),
      });
    }
    const onHand = new Map<string, number>();
    for (const s of this.stock) if ((s.locationId ?? null) === loc) onHand.set(s.productId, (onHand.get(s.productId) ?? 0) + Number(s.quantity));
    const committed = new Map<string, number>();
    for (const c of this.commitments) if (this.live(c) && (c.locationId ?? null) === loc) committed.set(c.productId, (committed.get(c.productId) ?? 0) + c.quantity);
    const ch = connection?.channelSettings ?? {};
    return {
      ...this.catalog,
      products: [...raw.values()],
      published: new Set([...this.catalog.published, ...(this.channelProducts.get(connectionId) ?? [])]),
      mapped: new Map(mappings.map((m) => [m.bookoneProductId, { externalProductId: m.externalProductId, externalVariantId: m.externalVariantId }])),
      onHand,
      committed,
      currency: connection?.currency ?? 'LKR',
      channel: {
        safetyBuffer: Number(ch.safetyBuffer ?? 0) || 0,
        allowBackorder: Boolean(ch.allowBackorder),
        timezone: ch.timezone || 'Asia/Colombo',
        priceListId: ch.priceListId ?? null,
      },
    };
  }
  priceListRows: Array<{ id: string; tenantId: string; name: string; currency: string; customerGroup: string | null; voided: boolean }> = [];
  async listPriceLists(tenantId: string) {
    return this.priceListRows
      .filter((l) => l.tenantId === tenantId && !l.voided)
      .map((l) => ({ id: l.id, name: l.name, currency: l.currency, customerGroup: l.customerGroup, itemCount: this.catalog.priceLists?.find((x) => x.id === l.id)?.entries.size ?? 0 }));
  }
  async savePriceList(tenantId: string, input: { id?: string; name: string; currency: string; customerGroup: string | null; archive?: boolean }) {
    const lists = (this.catalog.priceLists ??= []);
    if (input.id) {
      const row = this.priceListRows.find((l) => l.id === input.id);
      if (row && input.archive) {
        row.voided = true;
        this.catalog.priceLists = lists.filter((l) => l.id !== input.id);
      } else if (row) {
        Object.assign(row, { name: input.name, currency: input.currency, customerGroup: input.customerGroup });
        const l = lists.find((x) => x.id === input.id);
        if (l) Object.assign(l, { name: input.name, currency: input.currency, customerGroup: input.customerGroup });
      }
      return input.id;
    }
    const id = `pl-${this.priceListRows.length + 1}`;
    this.priceListRows.push({ id, tenantId, name: input.name, currency: input.currency, customerGroup: input.customerGroup, voided: false });
    lists.push({ id, name: input.name, currency: input.currency, customerGroup: input.customerGroup, entries: new Map(), updatedAt: new Date().toISOString() });
    return id;
  }
  async upsertPriceEntries(tenantId: string, priceListId: string, rows: PriceEntryInput[]) {
    void tenantId;
    const list = this.catalog.priceLists?.find((l) => l.id === priceListId);
    if (!list) return 0;
    for (const r of rows) {
      if (!r.price && !r.compareAtPrice && !r.salePrice && !r.tiers.length) list.entries.delete(r.productId);
      else list.entries.set(r.productId, { ...r, updatedAt: new Date().toISOString() });
    }
    return rows.length;
  }
  async saleBoundaryProductIds(tenantId: string, priceListId: string, fromIso: string, toIso: string) {
    void tenantId;
    const list = this.catalog.priceLists?.find((l) => l.id === priceListId);
    if (!list) return [];
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    const crossed = (iso: string | null) => (iso ? Date.parse(iso) > from && Date.parse(iso) <= to : false);
    return [...list.entries.values()].filter((e) => crossed(e.saleStartsAt) || crossed(e.saleEndsAt)).map((e) => e.productId);
  }
  channelProducts = new Map<string, Set<string>>();
  async listChannelProductIds(tenantId: string, connectionId: string) {
    void tenantId;
    return [...(this.channelProducts.get(connectionId) ?? [])];
  }
  async setChannelProducts(tenantId: string, connectionId: string, productIds: string[], published: boolean) {
    void tenantId;
    const set = this.channelProducts.get(connectionId) ?? new Set<string>();
    let n = 0;
    for (const id of productIds) {
      if (published && !set.has(id)) { set.add(id); n += 1; }
      if (!published && set.delete(id)) n += 1;
    }
    this.channelProducts.set(connectionId, set);
    return n;
  }
  async getOrderById(tenantId: string, orderId: string) {
    const row = this.orders.find((o) => o.tenantId === tenantId && o.id === orderId);
    return row ? structuredClone(row) : null;
  }
  async committedQty(tenantId: string, productId: string, locationId: string | null) {
    return this.commitments
      .filter((c) => c.tenantId === tenantId && c.productId === productId && this.live(c) && (c.locationId ?? null) === (locationId ?? null))
      .reduce((sum, c) => sum + c.quantity, 0);
  }
  async commitStock(input: { tenantId: string; connectionId: string; orderId: string; locationId: string | null; lines: Array<{ productId: string; quantity: number }> }) {
    const byProduct = new Map<string, number>();
    for (const line of input.lines) byProduct.set(line.productId, (byProduct.get(line.productId) ?? 0) + line.quantity);
    const short: Array<{ productId: string; available: number; needed: number }> = [];
    for (const [productId, needed] of byProduct) {
      const stock = await this.getStock(input.tenantId, productId, input.locationId);
      const available = Number(stock?.quantity ?? 0) - (await this.committedQty(input.tenantId, productId, input.locationId));
      if (available + 1e-9 < needed) short.push({ productId, available: Math.max(0, available), needed });
    }
    if (short.length) return { ok: false as const, short };
    for (const [productId, quantity] of byProduct) {
      this.commitments.push({ tenantId: input.tenantId, orderId: input.orderId, productId, locationId: input.locationId, quantity, status: 'active' });
    }
    return { ok: true as const };
  }
  async settleCommitments(tenantId: string, orderId: string, status: 'released' | 'consumed' | 'active') {
    const from = status === 'active' ? 'consumed' : 'active';
    let n = 0;
    for (const c of this.commitments) {
      if (c.tenantId === tenantId && c.orderId === orderId && c.status === from) {
        c.status = status;
        n += 1;
      }
    }
    return n;
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
  async listOrderEvents(tenantId: string, connectionId: string, orderId: string) {
    return this.events.filter((e) => e.tenantId === tenantId && e.connectionId === connectionId && e.orderId === orderId);
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
  // ---- WP3 reservations ----
  async insertReservation(row: ReservationRow) {
    this.reservations.push(structuredClone(row));
  }
  async getReservation(tenantId: string, id: string) {
    const r = this.reservations.find((x) => x.tenantId === tenantId && x.id === id);
    return r ? structuredClone(r) : null;
  }
  async updateReservation(row: ReservationRow) {
    const i = this.reservations.findIndex((x) => x.id === row.id);
    if (i >= 0) this.reservations[i] = structuredClone(row);
  }
  async listReservations(tenantId: string, connectionId: string | null, status?: string) {
    return this.reservations
      .filter((r) => r.tenantId === tenantId && (!connectionId || r.connectionId === connectionId) && (!status || r.status === status))
      .map((r) => structuredClone(r));
  }
  async holdReservation(input: {
    tenantId: string;
    connectionId: string;
    reservationId: string;
    locationId: string | null;
    expiresAt: string;
    partial: boolean;
    lines: Array<{ productId: string; quantity: number }>;
  }) {
    const byProduct = new Map<string, number>();
    for (const l of input.lines) byProduct.set(l.productId, (byProduct.get(l.productId) ?? 0) + l.quantity);
    const lines: Array<{ productId: string; needed: number; available: number; held: number }> = [];
    for (const [productId, needed] of byProduct) {
      const stock = await this.getStock(input.tenantId, productId, input.locationId);
      const available = Math.max(0, Number(stock?.quantity ?? 0) - (await this.committedQty(input.tenantId, productId, input.locationId)));
      lines.push({ productId, needed, available, held: available + 1e-9 >= needed ? needed : input.partial ? available : 0 });
    }
    const ok = lines.every((l) => l.held + 1e-9 >= l.needed);
    if (!ok && !input.partial) return { ok, lines: lines.map((l) => ({ ...l, held: 0 })) };
    for (const l of lines) {
      if (l.held > 0) {
        this.commitments.push({
          tenantId: input.tenantId,
          orderId: null,
          reservationId: input.reservationId,
          expiresAt: input.expiresAt,
          productId: l.productId,
          locationId: input.locationId,
          quantity: l.held,
          status: 'active',
        });
      }
    }
    return { ok, lines };
  }
  async releaseReservationHolds(tenantId: string, reservationId: string, status: 'released' | 'consumed') {
    let n = 0;
    for (const c of this.commitments) {
      if (c.tenantId === tenantId && c.reservationId === reservationId && !c.orderId && c.status === 'active') {
        c.status = status;
        n += 1;
      }
    }
    return n;
  }
  async extendReservationHolds(tenantId: string, reservationId: string, expiresAt: string) {
    let n = 0;
    for (const c of this.commitments) {
      if (c.tenantId === tenantId && c.reservationId === reservationId && !c.orderId && c.status === 'active') {
        c.expiresAt = expiresAt;
        n += 1;
      }
    }
    return n;
  }
  async transferReservationToOrder(tenantId: string, reservationId: string, orderId: string) {
    let n = 0;
    for (const c of this.commitments) {
      if (c.tenantId === tenantId && c.reservationId === reservationId && !c.orderId && this.live(c)) {
        c.orderId = orderId;
        c.expiresAt = null;
        n += 1;
      }
    }
    return n;
  }

  // ---- WP4 webhooks ----
  async listWebhooks(tenantId: string, connectionId: string | null) {
    return this.webhooks
      .filter((w) => w.tenantId === tenantId && !w.voided && (!connectionId || w.connectionId === connectionId))
      .map((w) => structuredClone(w));
  }
  async insertWebhook(row: WebhookRow) {
    this.webhooks.push(structuredClone(row));
  }
  async updateWebhook(row: WebhookRow) {
    const i = this.webhooks.findIndex((w) => w.id === row.id);
    if (i >= 0) this.webhooks[i] = structuredClone(row);
  }
  async insertDeliveries(rows: DeliveryRow[]) {
    for (const r of rows) this.deliveries.push(structuredClone(r));
  }
  async listDueDeliveries(tenantId: string, nowIso: string, limit: number) {
    return this.deliveries
      .filter((d) => d.tenantId === tenantId && d.status === 'pending' && d.nextAttemptAt <= nowIso)
      .sort((a, b) => a.revision - b.revision)
      .slice(0, limit)
      .map((d) => structuredClone(d));
  }
  async updateDelivery(row: DeliveryRow) {
    const i = this.deliveries.findIndex((d) => d.id === row.id);
    if (i >= 0) this.deliveries[i] = structuredClone(row);
  }
  async listDeliveries(tenantId: string, webhookId: string, limit: number) {
    return this.deliveries
      .filter((d) => d.tenantId === tenantId && d.webhookId === webhookId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit)
      .map((d) => structuredClone(d));
  }

  // ---- WP6 customers ----
  async getCustomer(tenantId: string, connectionId: string, match: { id?: string; channelCustomerId?: string }) {
    const c = this.customers.find(
      (x) =>
        x.tenantId === tenantId &&
        x.connectionId === connectionId &&
        (match.id ? x.id === match.id : x.channelCustomerId === match.channelCustomerId),
    );
    return c ? structuredClone(c) : null;
  }
  async upsertCustomer(row: CustomerRow) {
    const i = this.customers.findIndex((c) => c.id === row.id);
    if (i >= 0) this.customers[i] = structuredClone(row);
    else this.customers.push(structuredClone(row));
  }

  // ---- WP7 ----
  async insertApiCall(row: ApiCallRow) {
    this.apiCalls.push(row);
  }
  async listApiCalls(tenantId: string, connectionId: string, limit: number) {
    return this.apiCalls.filter((c) => c.tenantId === tenantId && c.connectionId === connectionId).slice(-limit).reverse();
  }
  async salesStats(_tenantId: string, productIds: string[]) {
    const out = new Map<string, { d30: number; d90: number; all: number }>();
    for (const id of productIds) out.set(id, this.sold.get(id) ?? { d30: 0, d90: 0, all: 0 });
    return out;
  }
  related = new Map<string, string[]>();
  async relatedProductIds(_tenantId: string, productId: string, limit: number) {
    return (this.related.get(productId) ?? []).slice(0, limit);
  }
}
