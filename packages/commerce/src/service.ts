import { randomUUID } from 'node:crypto';
import { CommerceError } from './errors';
import { defaultScopes, grantedScopeNames, hashSecret, hashesEqual, issueToken, parseScopes, parseToken, redactedCredential } from './credentials';
import { moneyString, parseMoney, parseQty, stableHash } from './money';
import type { ApiCallRow, CommerceStore, CustomerRow, DeliveryRow, ReservationRow, WebhookRow } from './store';
import {
  decryptSecret,
  encryptSecret,
  kindMatches,
  newWebhookSecret,
  parseKinds,
  retryDelayMs,
  signWebhook,
  validateWebhookUrl,
  WEBHOOK_RETRY_WINDOW_MS,
  WEBHOOK_ROTATION_OVERLAP_MS,
} from './webhooks';
import { addressText, normalizeOrderInput, orderView } from './order-view';
import type {
  AcknowledgementItem,
  CommerceActor,
  CommerceScope,
  ConnectionKind,
  ConnectionRow,
  CredentialRow,
  MappingInput,
  MappingObservation,
  MappingPreviewRow,
  MappingProposalRow,
  OperatorActor,
  OrderEventInput,
  OrderInput,
  OrderRow,
  OrderStatus,
  OutboxRow,
  Address,
  PostingPort,
  PublishClaimRow,
  CommerceEnvironment,
} from './types';
import { fail, validateEvent, validateOrderInput } from './validate';
import { normalizePaymentSettings, paymentMethodKey, resolvePaymentAccount, withSeenMethod } from './payments';
import { DEFAULT_COMMIT_STOCK_METHODS, UNPAID_METHOD, type PaymentSettings } from './types';
import { EMPTY_FULFILMENT, normalizeFulfilment, trackingUrlFor } from './fulfilment';
import { channelPrice, unitPriceFor } from './pricing';
import type { PriceEntryInput } from './store';
import {
  activeList,
  attributeList,
  brandList,
  buildProduct,
  catalogPage,
  categoryList,
  findCatalogProduct,
  missingWeight,
  pageOf,
  visibleTree,
  type CatalogBundle,
  type CatalogInclude,
  type CatalogQuery,
} from './catalog';

const PAGE_SIZE = 100;
const CURSOR_WINDOW_REVISIONS = 5_000_000;

function nowIso() {
  return new Date().toISOString();
}

function encodeCursor(revision: number): string {
  return Buffer.from(JSON.stringify({ v: 1, r: revision }), 'utf8').toString('base64url');
}

function decodeCursor(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { v?: number; r?: number };
    if (parsed.v !== 1 || typeof parsed.r !== 'number') fail('CURSOR_EXPIRED', 'The change cursor is not valid. Perform a full resync.');
    return parsed.r;
  } catch {
    fail('CURSOR_EXPIRED', 'The change cursor is not valid. Perform a full resync.');
  }
}

export class CommerceService {
  constructor(
    private readonly store: CommerceStore,
    private readonly pepper: string,
    private readonly posting: PostingPort,
  ) {}

  async createConnection(
    operator: OperatorActor,
    input: {
      name: string;
      kind: ConnectionKind;
      environment: CommerceEnvironment;
      locationId?: string | null;
      currency?: string;
    },
  ) {
    this.assertWrite(operator);
    if (!input.name?.trim()) fail('VALIDATION', 'Connection name is required.');
    const row: ConnectionRow = {
      id: randomUUID(),
      tenantId: operator.tenantId,
      createdByUserId: operator.userId,
      name: input.name.trim(),
      kind: input.kind,
      environment: input.environment,
      locationId: input.locationId ?? null,
      currency: input.currency ?? 'LKR',
      postingMode: 'preview',
      inboundPaused: false,
      outboundPaused: false,
      oversellPolicy: 'review',
      reservationMode: 'disabled',
      matchingPolicy: 'sku',
      taxMode: 'domestic_inclusive',
      paymentSettings: { defaultAccountCode: null, methods: {}, seenMethods: [] },
      status: 'active',
      lastCatalogSyncAt: null,
      lastStockSyncAt: null,
      lastOrderSyncAt: null,
      lastError: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await this.store.insertConnection(row);
    await this.audit(operator, row.id, 'connection.create', 'connection', row.id, { kind: row.kind, environment: row.environment });
    return row;
  }

  async updateConnection(
    operator: OperatorActor,
    connectionId: string,
    patch: Partial<Pick<ConnectionRow, 'name' | 'postingMode' | 'inboundPaused' | 'outboundPaused' | 'locationId'>>,
  ) {
    this.assertWrite(operator);
    const row = await this.requireConnection(operator.tenantId, connectionId);
    const next = { ...row, ...patch, updatedAt: nowIso() };
    await this.store.updateConnection(next);
    await this.audit(operator, connectionId, 'connection.update', 'connection', connectionId, patch as Record<string, unknown>);
    return next;
  }

  /** Where paid orders settle (account codes are validated by the caller against the chart). */
  async updatePaymentSettings(operator: OperatorActor, connectionId: string, settings: PaymentSettings) {
    this.assertWrite(operator);
    const row = await this.requireConnection(operator.tenantId, connectionId);
    const clean = normalizePaymentSettings({
      ...row.paymentSettings,
      ...settings,
      seenMethods: row.paymentSettings?.seenMethods ?? [],
    });
    for (const code of [clean.defaultAccountCode, ...Object.values(clean.methods)]) {
      if (code && code !== UNPAID_METHOD && !/^\d{4}$/.test(code)) fail('VALIDATION', `Account ${code} is not a valid account code.`);
    }
    const next = { ...row, paymentSettings: clean, updatedAt: nowIso() };
    await this.store.updateConnection(next);
    await this.audit(operator, connectionId, 'connection.payments', 'connection', connectionId, {
      defaultAccountCode: clean.defaultAccountCode,
      methods: clean.methods,
    });
    return next;
  }

  async issueCredential(operator: OperatorActor, connectionId: string, scopes?: CommerceScope[]) {
    this.assertWrite(operator);
    const connection = await this.requireConnection(operator.tenantId, connectionId);
    const issued = issueToken(connection.environment);
    const granted = scopes && scopes.length ? scopes : defaultScopes();
    const row: CredentialRow = {
      id: randomUUID(),
      tenantId: operator.tenantId,
      connectionId,
      createdByUserId: operator.userId,
      prefix: issued.prefix,
      secretHash: hashSecret(issued.secret, this.pepper),
      scopes: granted,
      status: 'active',
      expiresAt: null,
      lastUsedAt: null,
      rotatedFromId: null,
      createdAt: nowIso(),
    };
    await this.store.insertCredential(row);
    await this.audit(operator, connectionId, 'credential.issue', 'credential', row.id, { prefix: row.prefix, scopes: granted });
    return { ...redactedCredential(row), token: issued.token, secretShownOnce: true };
  }

  async rotateCredential(operator: OperatorActor, connectionId: string, credentialId: string) {
    this.assertWrite(operator);
    const list = await this.store.listCredentials(operator.tenantId, connectionId);
    const current = list.find((c) => c.id === credentialId);
    if (!current) fail('NOT_FOUND', 'Credential was not found.');
    const issued = await this.issueCredential(operator, connectionId, current.scopes);
    current.status = 'rotated';
    current.rotatedFromId = current.id;
    current.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await this.store.updateCredential(current);
    await this.audit(operator, connectionId, 'credential.rotate', 'credential', current.id, { prefix: current.prefix });
    return { ...issued, previousExpiresAt: current.expiresAt, rotatedFromPrefix: current.prefix };
  }

  async revokeCredential(operator: OperatorActor, connectionId: string, credentialId: string) {
    this.assertWrite(operator);
    const list = await this.store.listCredentials(operator.tenantId, connectionId);
    const current = list.find((c) => c.id === credentialId);
    if (!current) fail('NOT_FOUND', 'Credential was not found.');
    current.status = 'revoked';
    current.expiresAt = nowIso();
    await this.store.updateCredential(current);
    await this.audit(operator, connectionId, 'credential.revoke', 'credential', current.id, { prefix: current.prefix });
    return redactedCredential(current);
  }

  async listOperatorView(operator: OperatorActor) {
    const connections = await this.store.listConnections(operator.tenantId);
    const out = [];
    for (const connection of connections) {
      const credentials = (await this.store.listCredentials(operator.tenantId, connection.id)).map(redactedCredential);
      const mappings = await this.store.listMappings(operator.tenantId, connection.id);
      const products = await this.store.listSellableProducts(operator.tenantId);
      const activity = await this.store.listActivity(operator.tenantId, connection.id);
      const review = await this.store.listOrders(operator.tenantId, connection.id, 'needs_review');
      out.push({
        connection,
        credentials,
        mappingCount: mappings.length,
        reviewCount: review.length,
        mappings: mappings.map((m) => ({
          id: m.id,
          sku: m.sku,
          bookoneProductId: m.bookoneProductId,
          bookoneName: products.find((p) => p.id === m.bookoneProductId)?.name ?? null,
          externalProductId: m.externalProductId,
          externalVariantId: m.externalVariantId,
          status: m.status,
        })),
        reviews: review.map((o) => ({
          id: o.id,
          externalId: o.externalId,
          status: o.status,
          reviewReason: o.reviewReason,
          createdAt: o.createdAt,
        })),
        activity: activity.slice(0, 50).map((a) => ({
          id: a.id,
          action: a.action,
          entity: a.entity,
          entityId: a.entityId,
          createdAt: a.createdAt,
          detail: sanitizeActivityDetail(a.detail),
        })),
        proposals: (await this.store.listMappingProposals(operator.tenantId, connection.id))
          .filter((p) => p.status === 'proposed' || p.status === 'approved')
          .slice(0, 20),
        publishClaims: (await this.store.listPublishClaims(operator.tenantId, connection.id)).slice(0, 50),
      });
    }
    return out;
  }

  async authenticate(authorization: string | null): Promise<CommerceActor> {
    const raw = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization?.trim();
    if (!raw) fail('UNAUTHENTICATED', 'A commerce bearer token is required.');
    const parsed = parseToken(raw);
    if (!parsed) fail('UNAUTHENTICATED', 'The commerce token is invalid, revoked or expired.');
    const credential = await this.store.getCredentialByPrefix(parsed.prefix);
    if (!credential) fail('UNAUTHENTICATED', 'The commerce token is invalid, revoked or expired.');
    if (!hashesEqual(credential.secretHash, hashSecret(parsed.secret, this.pepper))) {
      fail('UNAUTHENTICATED', 'The commerce token is invalid, revoked or expired.');
    }
    if (credential.status === 'revoked') fail('FORBIDDEN', 'This commerce key has been revoked.');
    if (credential.expiresAt && Date.parse(credential.expiresAt) < Date.now()) fail('FORBIDDEN', 'This commerce key has expired.');
    const connection = await this.store.getConnection(credential.tenantId, credential.connectionId);
    if (!connection || connection.status !== 'active') fail('FORBIDDEN', 'This commerce connection is not active.');
    credential.lastUsedAt = nowIso();
    await this.store.updateCredential(credential);
    return {
      tenantId: credential.tenantId,
      connectionId: connection.id,
      credentialId: credential.id,
      userId: connection.createdByUserId,
      locationId: connection.locationId,
      currency: connection.currency,
      environment: connection.environment,
      kind: connection.kind,
      scopes: credential.scopes,
      postingMode: connection.postingMode,
      inboundPaused: connection.inboundPaused,
      outboundPaused: connection.outboundPaused,
      oversellPolicy: connection.oversellPolicy,
      reservationMode: connection.reservationMode,
      prefix: credential.prefix,
    };
  }

  async connection(actor: CommerceActor) {
    this.need(actor, 'catalog');
    const row = await this.requireConnection(actor.tenantId, actor.connectionId);
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      environment: row.environment,
      locationId: row.locationId,
      currency: row.currency,
      scopes: actor.scopes,
      // WP7: fine-grained names this key grants (aliases of the v1 scopes).
      grantedScopes: grantedScopeNames(actor.scopes),
      postingMode: row.postingMode,
      inboundPaused: row.inboundPaused,
      outboundPaused: row.outboundPaused,
      oversellPolicy: row.oversellPolicy,
      reservationMode: row.reservationMode,
      // WP1 C5: the channel this key belongs to.
      channel: { id: row.id, name: row.name },
      priceListId: row.channelSettings?.priceListId ?? 'default',
      stockLocationIds: row.locationId ? [row.locationId] : [],
      taxMode: row.taxMode.includes('exclusive') ? 'exclusive' : 'inclusive',
      timezone: row.channelSettings?.timezone || 'Asia/Colombo',
      safetyBuffer: Number(row.channelSettings?.safetyBuffer ?? 0) || 0,
      allowBackorder: Boolean(row.channelSettings?.allowBackorder),
      capabilities: {
        catalog: true,
        catalogProducts: true,
        catalogCategories: true,
        catalogBrands: true,
        catalogAttributes: true,
        variants: true,
        images: true,
        channelPublishing: true,
        inventory: true,
        committedStock: true,
        orders: true,
        webOrders: true,
        fulfilment: true,
        paymentMethods: true,
        lifecycle: true,
        changeKinds: ['product', 'variant', 'price', 'image', 'inventory', 'category', 'brand', 'order', 'customer', 'reservation', 'mapping', 'publish', 'catalog'],
        changeKindFilter: true,
        etag: true,
        reservations: true,
        priceExport: true,
        priceLists: true,
        salePrices: true,
        priceTiers: true,
        customerGroupPricing: true,
        webhooks: true,
        customers: true,
        orderList: true,
        orderInvoice: true,
        returns: true,
        productStats: true,
        relatedProducts: true,
        newArrivals: true,
        incomingStock: true,
        apiCallLog: true,
        ipAllowList: false,
        multiLocation: false,
      },
      serviceTime: nowIso(),
      apiVersion: 'v1',
    };
  }

  async products(actor: CommerceActor, cursor?: string) {
    this.need(actor, 'catalog');
    const mappings = await this.store.listMappings(actor.tenantId, actor.connectionId);
    const products = await this.store.listSellableProducts(actor.tenantId);
    const mapped = mappings
      .map((m) => {
        const product = products.find((p) => p.id === m.bookoneProductId);
        if (!product) return null;
        return {
          id: product.id,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          revision: product.revision,
          archived: product.archived,
          externalProductId: m.externalProductId,
          externalVariantId: m.externalVariantId,
        };
      })
      .filter(Boolean);
    const start = cursor ? Number(Buffer.from(cursor, 'base64url').toString('utf8')) || 0 : 0;
    const page = mapped.slice(start, start + PAGE_SIZE);
    const next = start + PAGE_SIZE < mapped.length ? Buffer.from(String(start + PAGE_SIZE)).toString('base64url') : null;
    return { items: page, nextCursor: next };
  }

  async inventory(actor: CommerceActor, skus?: string[]) {
    this.need(actor, 'inventory');
    if (actor.outboundPaused) fail('OUTBOUND_PAUSED', 'Outbound stock publishing is paused for this connection.');
    const wanted = skus && skus.length ? new Set(skus) : null;
    if (wanted && wanted.size > 100) fail('VALIDATION', 'Inventory lookup batches are limited to 100 SKUs.');
    const connection = await this.requireConnection(actor.tenantId, actor.connectionId);
    const buffer = Number(connection.channelSettings?.safetyBuffer ?? 0) || 0;
    const channelBackorder = Boolean(connection.channelSettings?.allowBackorder);
    // Published to the channel: linked (mapped) SKUs plus products/variants published in BookOne (WP1 C1).
    const rows = new Map<string, { sku: string; productId: string; externalProductId: string | null }>();
    for (const mapping of await this.store.listMappings(actor.tenantId, actor.connectionId)) {
      rows.set(mapping.bookoneProductId, { sku: mapping.sku, productId: mapping.bookoneProductId, externalProductId: mapping.externalProductId });
    }
    if (this.store.catalogBundle) {
      const b = await this.store.catalogBundle(actor.tenantId, actor.connectionId);
      for (const entry of visibleTree(b, 'published')) {
        const sellables = entry.variants.length ? entry.variants : [entry.product];
        for (const p of sellables) {
          if (p.productType === 'variable') continue;
          if (!rows.has(p.id)) rows.set(p.id, { sku: p.sku, productId: p.id, externalProductId: null });
        }
      }
    }
    const items = [];
    const extras = (await this.store.stockExtras?.(actor.tenantId, [...rows.keys()])) ?? new Map();
    for (const row of rows.values()) {
      if (wanted && !wanted.has(row.sku) && !(row.externalProductId && wanted.has(row.externalProductId))) continue;
      const extra = extras.get(row.productId);
      const stock = await this.store.getStock(actor.tenantId, row.productId, actor.locationId);
      const onHand = Number(stock?.quantity ?? 0);
      const committed = (await this.store.committedQty?.(actor.tenantId, row.productId, actor.locationId)) ?? 0;
      const available = Math.max(0, onHand - committed - buffer);
      items.push({
        sku: row.sku,
        productId: row.productId,
        locationId: actor.locationId,
        // `quantity` is what this channel may sell: on hand minus held stock minus the channel safety buffer.
        quantity: qtyString(available),
        onHand: qtyString(onHand),
        committed: qtyString(committed),
        available: qtyString(available),
        safetyBuffer: qtyString(buffer),
        allowBackorder: channelBackorder,
        // WP3: reorder level from the product, and open purchase orders with a delivery date.
        lowStockThreshold: extra?.lowStockThreshold != null ? qtyString(extra.lowStockThreshold) : null,
        incoming: (extra?.incoming ?? []).map((i: { quantity: number; expectedAt: string | null }) => ({ quantity: qtyString(i.quantity), expectedAt: i.expectedAt })),
        locations: [{ locationId: actor.locationId, available: qtyString(available) }],
        revision: stock?.revision ?? 0,
        asOf: stock?.asOf ?? nowIso(),
        stale: stock?.stale ?? false,
      });
    }
    return { items, authority: 'bookone', mode: 'absolute', scope: 'published', nextCursor: null, requestId: randomUUID() };
  }

  async changes(actor: CommerceActor, cursor?: string, kindsRaw?: string | null) {
    this.need(actor, 'catalog');
    let kinds: string[] = [];
    try {
      kinds = parseKinds(kindsRaw ?? '');
    } catch (e) {
      fail('VALIDATION', e instanceof Error ? e.message : 'Unknown change kind.');
    }
    await this.tickSales(actor).catch(() => undefined);
    await this.expireReservations(actor.tenantId).catch(() => 0);
    const after = decodeCursor(cursor);
    const max = await this.store.maxRevision(actor.tenantId, actor.connectionId);
    if (after > 0 && max - after > CURSOR_WINDOW_REVISIONS) {
      throw new CommerceError({
        code: 'CURSOR_EXPIRED',
        message: 'The change cursor has expired. Request a full snapshot of products and inventory.',
        httpStatus: 422,
        details: { fullResync: true },
      });
    }
    const rows = await this.store.listOutbox(actor.tenantId, actor.connectionId, after, PAGE_SIZE);
    const last = rows[rows.length - 1]?.revision ?? after;
    // The cursor moves past filtered-out items too, so a filtered client never re-reads them.
    const items = rows.map((r) => CommerceService.feedItem(r)).filter((i) => kindMatches(kinds, i));
    return { items, nextCursor: encodeCursor(last), fullResync: false, hasMore: rows.length === PAGE_SIZE, requestId: randomUUID() };
  }

  async previewMappings(operator: OperatorActor, connectionId: string, proposed: MappingInput[]) {
    this.assertWrite(operator);
    const existing = await this.store.listMappings(operator.tenantId, connectionId);
    const preview = [];
    for (const row of proposed) {
      const product = await this.store.getProduct(operator.tenantId, row.bookoneProductId);
      const sku = row.sku || product?.sku || '';
      const conflict =
        existing.find(
          (m) =>
            m.bookoneProductId !== row.bookoneProductId &&
            (m.sku === sku ||
              (m.externalProductId === row.externalProductId &&
                (m.externalVariantId || '') === (row.externalVariantId ?? ''))),
        ) ?? null;
      preview.push({
        sku,
        bookoneProductId: row.bookoneProductId,
        bookoneName: product?.name ?? null,
        externalProductId: row.externalProductId,
        externalVariantId: row.externalVariantId ?? '',
        issue: product
          ? conflict
            ? `Conflicts with existing mapping ${conflict.sku} / ${conflict.externalProductId}.`
            : null
          : 'BookOne product was not found.',
      });
    }
    return { items: preview, preservesUnrelatedListings: true };
  }

  async applyMappings(operator: OperatorActor, connectionId: string, proposed: MappingInput[]) {
    this.assertWrite(operator);
    const connection = await this.requireConnection(operator.tenantId, connectionId);
    for (const row of proposed) {
      const product = await this.store.getProduct(operator.tenantId, row.bookoneProductId);
      if (!product) fail('VALIDATION', `BookOne product ${row.bookoneProductId} was not found.`);
      await this.store.upsertMapping({
        id: randomUUID(),
        tenantId: operator.tenantId,
        connectionId,
        bookoneProductId: row.bookoneProductId,
        sku: row.sku || product.sku,
        externalProductId: row.externalProductId,
        externalVariantId: row.externalVariantId ?? '',
        status: 'mapped',
        optedInFields: row.optedInFields ?? ['sku', 'name', 'unit'],
      });
      const revision = await this.store.nextRevision(operator.tenantId, connectionId);
      await this.store.insertOutbox({
        id: randomUUID(),
        tenantId: operator.tenantId,
        connectionId,
        revision,
        kind: 'catalog',
        productId: product.id,
        sku: product.sku,
        payload: { sku: product.sku, name: product.name, unit: product.unit, revision },
        createdAt: nowIso(),
      });
      await this.emitCatalogEvent(operator.tenantId, connectionId, 'mapping', product.id, product.sku, {
        action: 'applied',
        sku: product.sku,
        bookoneProductId: product.id,
        externalProductId: row.externalProductId,
        externalVariantId: row.externalVariantId ?? '',
      });
    }
    connection.lastCatalogSyncAt = nowIso();
    await this.store.updateConnection(connection);
    await this.audit(operator, connectionId, 'mapping.apply', 'mapping', connectionId, { count: proposed.length });
    return { applied: proposed.length };
  }

  async listCatalogForAgent(operator: OperatorActor, q?: string) {
    const products = await this.store.listSellableProducts(operator.tenantId);
    const needle = q?.trim().toLowerCase() ?? '';
    return products
      .filter((p) => p.isActive && !p.archived)
      .filter((p) => !needle || p.sku.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle))
      .slice(0, 50)
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        archived: p.archived,
        sellPrice: p.sellPrice,
      }));
  }

  async mappingSummary(operator: OperatorActor, connectionId: string) {
    const connection = await this.requireConnection(operator.tenantId, connectionId);
    const mappings = await this.store.listMappings(operator.tenantId, connectionId);
    const products = await this.store.listSellableProducts(operator.tenantId);
    return {
      connectionId: connection.id,
      connectionName: connection.name,
      locationId: connection.locationId,
      mapped: mappings.length,
      items: mappings.map((m) => ({
        sku: m.sku,
        bookoneProductId: m.bookoneProductId,
        bookoneName: products.find((p) => p.id === m.bookoneProductId)?.name ?? null,
        externalProductId: m.externalProductId,
        externalVariantId: m.externalVariantId,
        status: m.status,
      })),
    };
  }

  async previewMappingObservations(
    operator: OperatorActor,
    connectionId: string,
    observations: MappingObservation[],
  ) {
    await this.requireConnection(operator.tenantId, connectionId);
    if (observations.length > 50) fail('VALIDATION', 'Mapping proposals are limited to 50 rows.');
    const existing = await this.store.listMappings(operator.tenantId, connectionId);
    const products = await this.store.listSellableProducts(operator.tenantId);
    const items = observations.map((obs) => classifyObservation(obs, products, existing));
    return { items, preservesUnrelatedListings: true };
  }

  async saveMappingProposal(
    operator: OperatorActor,
    connectionId: string,
    observations: MappingObservation[],
    origin: MappingObservation['origin'] = 'agent',
  ) {
    this.assertWrite(operator);
    const preview = await this.previewMappingObservations(operator, connectionId, observations);
    const now = nowIso();
    const row: MappingProposalRow = {
      id: randomUUID(),
      tenantId: operator.tenantId,
      connectionId,
      createdByUserId: operator.userId,
      origin,
      status: 'proposed',
      expectedRevision: 1,
      items: preview.items,
      receipt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.insertMappingProposal(row);
    await this.audit(operator, connectionId, 'mapping.propose', 'mapping', row.id, {
      count: row.items.length,
      origin,
    });
    return row;
  }

  async applyMappingProposal(operator: OperatorActor, connectionId: string, proposalId: string) {
    this.assertWrite(operator);
    const proposal = await this.store.getMappingProposal(operator.tenantId, proposalId);
    if (!proposal || proposal.connectionId !== connectionId) fail('NOT_FOUND', 'Mapping proposal was not found.');
    if (proposal.status === 'applied') {
      return { applied: 0, replayed: true, proposalId: proposal.id, receipt: proposal.receipt };
    }
    if (proposal.status === 'rejected' || proposal.status === 'stale') {
      fail('CONFLICT', `This proposal is ${proposal.status} and cannot be applied.`);
    }
    const suggested = proposal.items.filter((item) => item.kind === 'suggested' && item.bookoneProductId);
    if (!suggested.length) fail('VALIDATION', 'This proposal has no suggested rows to apply.');
    const observations: MappingObservation[] = suggested.map((item) => ({
      sku: item.sku,
      externalProductId: item.externalProductId,
      externalVariantId: item.externalVariantId,
      origin: item.origin,
    }));
    const recheck = await this.previewMappingObservations(operator, connectionId, observations);
    const conflict = recheck.items.find((item) => item.kind === 'conflicting' || item.kind === 'ambiguous');
    if (conflict) {
      proposal.status = 'stale';
      proposal.items = recheck.items;
      proposal.updatedAt = nowIso();
      await this.store.updateMappingProposal(proposal);
      fail('CONFLICT', conflict.reason);
    }
    const toApply: MappingInput[] = recheck.items
      .filter((item) => (item.kind === 'suggested' || item.kind === 'unchanged') && item.bookoneProductId)
      .map((item) => ({
        bookoneProductId: item.bookoneProductId as string,
        sku: item.sku,
        externalProductId: item.externalProductId,
        externalVariantId: item.externalVariantId,
      }));
    const result = await this.applyMappings(operator, connectionId, toApply);
    proposal.status = 'applied';
    proposal.receipt = { applied: result.applied };
    proposal.updatedAt = nowIso();
    await this.store.updateMappingProposal(proposal);
    return { applied: result.applied, replayed: false, proposalId: proposal.id, receipt: proposal.receipt };
  }

  async rejectMappingProposal(operator: OperatorActor, connectionId: string, proposalId: string) {
    this.assertWrite(operator);
    const proposal = await this.store.getMappingProposal(operator.tenantId, proposalId);
    if (!proposal || proposal.connectionId !== connectionId) fail('NOT_FOUND', 'Mapping proposal was not found.');
    proposal.status = 'rejected';
    proposal.updatedAt = nowIso();
    await this.store.updateMappingProposal(proposal);
    await this.audit(operator, connectionId, 'mapping.reject', 'mapping', proposal.id, {});
    return { rejected: true, proposalId: proposal.id };
  }

  async previewPublish(operator: OperatorActor, connectionId: string, productIds: string[]) {
    this.assertWrite(operator);
    const connection = await this.requireConnection(operator.tenantId, connectionId);
    const uniqueIds = [...new Set(productIds.filter(Boolean))].slice(0, 100);
    const mappings = await this.store.listMappings(operator.tenantId, connectionId);
    const products = await this.store.listSellableProducts(operator.tenantId);
    const items = uniqueIds.map((id) => {
      const product = products.find((p) => p.id === id);
      const mapped = mappings.find((m) => m.bookoneProductId === id);
      if (!product) {
        return {
          bookoneProductId: id,
          sku: '',
          name: null as string | null,
          kind: 'missing' as const,
          reason: 'BookOne product was not found.',
        };
      }
      if (product.archived || !product.isActive) {
        return {
          bookoneProductId: id,
          sku: product.sku,
          name: product.name,
          kind: 'unsupported' as const,
          reason: 'Archived or inactive products cannot be published.',
        };
      }
      if (mapped) {
        return {
          bookoneProductId: id,
          sku: product.sku,
          name: product.name,
          kind: 'already_linked' as const,
          reason: `Already linked to store product ${mapped.externalProductId}.`,
        };
      }
      if (!product.sellPrice || Number(product.sellPrice) <= 0) {
        return {
          bookoneProductId: id,
          sku: product.sku,
          name: product.name,
          kind: 'unsupported' as const,
          reason: 'A sell price is required before BookOne-first publish.',
        };
      }
      return {
        bookoneProductId: id,
        sku: product.sku,
        name: product.name,
        kind: 'create' as const,
        reason: connection.kind === 'woocommerce' ? 'Will create a WooCommerce draft.' : 'Website must create the listing then acknowledge the IDs.',
      };
    });
    return { items, kind: connection.kind, defaultWooStatus: 'draft' as const };
  }

  async queuePublish(operator: OperatorActor, connectionId: string, productIds: string[]) {
    this.assertWrite(operator);
    const preview = await this.previewPublish(operator, connectionId, productIds);
    const toCreate = preview.items.filter((item) => item.kind === 'create');
    if (!toCreate.length) fail('VALIDATION', 'No eligible products to publish. Linked, missing, or unsupported rows were skipped.');
    const now = nowIso();
    const claims: PublishClaimRow[] = [];
    for (const item of toCreate) {
      const existing = await this.store.getPublishClaim(operator.tenantId, connectionId, item.bookoneProductId);
      if (existing && (existing.status === 'claimed' || existing.status === 'created' || existing.status === 'acknowledged')) {
        claims.push(existing);
        continue;
      }
      const row: PublishClaimRow = {
        id: existing?.id ?? randomUUID(),
        tenantId: operator.tenantId,
        connectionId,
        bookoneProductId: item.bookoneProductId,
        sku: item.sku,
        claimKey: `pub:${connectionId}:${item.bookoneProductId}`,
        status: 'claimed',
        externalProductId: existing?.externalProductId ?? '',
        externalVariantId: existing?.externalVariantId ?? '',
        issue: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await this.store.upsertPublishClaim(row);
      await this.emitCatalogEvent(operator.tenantId, connectionId, 'publish', row.bookoneProductId, row.sku, {
        action: 'queued',
        claimId: row.id,
        sku: row.sku,
        bookoneProductId: row.bookoneProductId,
      });
      claims.push(row);
    }
    await this.audit(operator, connectionId, 'catalog.queue', 'mapping', connectionId, { count: claims.length });
    return { queued: claims.length, claims };
  }

  async catalogCandidates(actor: CommerceActor) {
    this.need(actor, 'catalog');
    const claims = await this.store.listPublishClaims(actor.tenantId, actor.connectionId);
    const products = await this.store.listSellableProducts(actor.tenantId);
    const mappings = await this.store.listMappings(actor.tenantId, actor.connectionId);
    const open = claims.filter((c) => c.status === 'claimed' || c.status === 'created');
    const items = open.map((claim) => {
      const product = products.find((p) => p.id === claim.bookoneProductId);
      const mapped = mappings.find((m) => m.bookoneProductId === claim.bookoneProductId);
      return {
        claimId: claim.id,
        bookoneProductId: claim.bookoneProductId,
        sku: claim.sku,
        name: product?.name ?? claim.sku,
        unit: product?.unit ?? 'each',
        sellPrice: product?.sellPrice ?? '0',
        status: claim.status,
        alreadyLinked: Boolean(mapped),
      };
    });
    return {
      items,
      bootstrap: items.length ? 'queued' : 'idle',
      defaultWooStatus: 'draft',
      mappedOnlyProductsPath: '/products',
    };
  }

  async acknowledgeCatalog(actor: CommerceActor, items: AcknowledgementItem[]) {
    this.need(actor, 'catalog');
    if (!items.length) fail('VALIDATION', 'Acknowledgement requires at least one item.');
    if (items.length > 100) fail('VALIDATION', 'Acknowledgement batches are limited to 100 items.');
    const operator: OperatorActor = {
      tenantId: actor.tenantId,
      userId: actor.userId,
      canWrite: true,
    };
    const receipts = [];
    for (const item of items) {
      if (!item.bookoneProductId || !item.externalProductId) {
        fail('VALIDATION', 'Each acknowledgement needs bookoneProductId and externalProductId.');
      }
      const product = await this.store.getProduct(actor.tenantId, item.bookoneProductId);
      if (!product) fail('VALIDATION', `BookOne product ${item.bookoneProductId} was not found.`);
      const claim =
        (item.claimId
          ? (await this.store.listPublishClaims(actor.tenantId, actor.connectionId)).find((c) => c.id === item.claimId)
          : null) ??
        (await this.store.getPublishClaim(actor.tenantId, actor.connectionId, item.bookoneProductId));
      if (claim?.status === 'acknowledged') {
        if (
          claim.externalProductId === item.externalProductId &&
          (claim.externalVariantId || '') === (item.externalVariantId ?? '')
        ) {
          receipts.push({
            bookoneProductId: item.bookoneProductId,
            status: 'acknowledged',
            replayed: true,
            externalProductId: claim.externalProductId,
          });
          continue;
        }
        fail(
          'CONFLICT',
          `Product ${product.sku} was already acknowledged as ${claim.externalProductId}. A second create is refused.`,
        );
      }
      const mapping: MappingInput = {
        bookoneProductId: item.bookoneProductId,
        sku: product.sku,
        externalProductId: item.externalProductId,
        externalVariantId: item.externalVariantId,
      };
      const preview = await this.previewMappings(operator, actor.connectionId, [mapping]);
      const issue = preview.items.find((row) => row.issue)?.issue;
      if (issue) fail('CONFLICT', issue);
      await this.applyMappings(operator, actor.connectionId, [mapping]);
      const now = nowIso();
      const nextClaim: PublishClaimRow = {
        id: claim?.id ?? randomUUID(),
        tenantId: actor.tenantId,
        connectionId: actor.connectionId,
        bookoneProductId: item.bookoneProductId,
        sku: product.sku,
        claimKey: claim?.claimKey ?? `pub:${actor.connectionId}:${item.bookoneProductId}`,
        status: 'acknowledged',
        externalProductId: item.externalProductId,
        externalVariantId: item.externalVariantId ?? '',
        issue: null,
        createdAt: claim?.createdAt ?? now,
        updatedAt: now,
      };
      await this.store.upsertPublishClaim(nextClaim);
      await this.emitCatalogEvent(actor.tenantId, actor.connectionId, 'publish', item.bookoneProductId, product.sku, {
        action: 'claimed',
        claimId: nextClaim.id,
        sku: product.sku,
        bookoneProductId: item.bookoneProductId,
        externalProductId: item.externalProductId,
      });
      receipts.push({
        bookoneProductId: item.bookoneProductId,
        status: 'acknowledged',
        replayed: false,
        externalProductId: item.externalProductId,
      });
    }
    return { ok: true as const, items: receipts };
  }

  async publishStock(operator: OperatorActor, connectionId: string) {
    this.assertWrite(operator);
    const connection = await this.requireConnection(operator.tenantId, connectionId);
    if (connection.outboundPaused) fail('OUTBOUND_PAUSED', 'Outbound stock publishing is paused.');
    const mappings = await this.store.listMappings(operator.tenantId, connectionId);
    if (mappings.length === 0) {
      fail(
        'VALIDATION',
        'Map at least one product before publishing BookOne stock. A zero-item publish is not a successful publication.',
      );
    }
    let count = 0;
    for (const mapping of mappings) {
      const stock = await this.store.getStock(operator.tenantId, mapping.bookoneProductId, connection.locationId);
      const revision = await this.store.nextRevision(operator.tenantId, connectionId);
      await this.store.insertOutbox({
        id: randomUUID(),
        tenantId: operator.tenantId,
        connectionId,
        revision,
        kind: 'inventory',
        productId: mapping.bookoneProductId,
        sku: mapping.sku,
        payload: {
          sku: mapping.sku,
          quantity: stock?.quantity ?? '0',
          revision,
          asOf: nowIso(),
          locationId: connection.locationId,
        },
        createdAt: nowIso(),
      });
      count += 1;
    }
    connection.lastStockSyncAt = nowIso();
    await this.store.updateConnection(connection);
    await this.audit(operator, connectionId, 'stock.publish', 'inventory', connectionId, {
      count,
      locationId: connection.locationId,
    });
    return { published: count, locationId: connection.locationId };
  }

  async validateOrder(actor: CommerceActor, input: OrderInput) {
    this.need(actor, 'order');
    const mappings = await this.store.listMappings(actor.tenantId, actor.connectionId);
    const products = await this.store.listSellableProducts(actor.tenantId);
    input = normalizeOrderInput(input);
    const preview = validateOrderInput(input, { currency: actor.currency, mappings, products });
    // PR8: flag lines whose unit price differs from the channel price; the order is still accepted (coupons are legitimate).
    if (this.store.catalogBundle) {
      const b = await this.store.catalogBundle(actor.tenantId, actor.connectionId);
      const list = activeList(b, (input as { customerGroup?: string }).customerGroup ?? null);
      for (const line of input.lines ?? []) {
        const mapped = preview.mapped.find((m) => m.sku === line.sku);
        const raw = mapped?.productId ? b.products.find((p) => p.id === mapped.productId) : null;
        if (!raw) continue;
        const expected = unitPriceFor(channelPrice(raw, list, b.currency), Number(line.quantity) || 1);
        if (Math.abs(Number(line.unitPrice) - Number(expected)) > 0.005) {
          preview.issues.push({
            code: 'PRICE_MISMATCH',
            message: `PRICE_MISMATCH:${line.sku}`,
            field: 'lines.unitPrice',
            blocking: false,
            expected,
            received: line.unitPrice,
          } as (typeof preview.issues)[number]);
        }
      }
    }
    return preview;
  }

  async submitOrder(actor: CommerceActor, input: OrderInput, idempotencyKey: string | null) {
    this.need(actor, 'order');
    if (actor.inboundPaused) fail('INBOUND_PAUSED', 'Inbound orders are paused for this connection.');
    if (!idempotencyKey?.trim()) fail('VALIDATION', 'Idempotency-Key is required.');
    if (!input.externalId?.trim()) fail('VALIDATION', 'Store order ID is required and is immutable.');
    input = normalizeOrderInput(input);
    const payloadHash = stableHash(input);
    const existingKey = await this.store.getIdempotency(actor.tenantId, actor.connectionId, idempotencyKey);
    const existingOrder = await this.store.getOrderByExternalId(actor.tenantId, actor.connectionId, input.externalId);
    if (existingKey) {
      if (existingKey.payloadHash !== payloadHash) {
        fail('CONFLICT', 'This Idempotency-Key was already used with a different payload.');
      }
      if (existingOrder && !existingOrder.documentId && existingOrder.status === 'received') {
        await this.finishEligiblePost(actor, existingOrder);
        const receipt = this.orderReceipt(existingOrder, 'accepted_for_processing');
        await this.store.putIdempotency(actor.tenantId, actor.connectionId, idempotencyKey, {
          payloadHash,
          orderId: existingOrder.id,
          receipt,
        });
        return { ...receipt, replayed: true };
      }
      return { ...existingKey.receipt, replayed: true };
    }
    if (existingOrder) {
      if (existingOrder.payloadHash !== payloadHash) {
        fail('CONFLICT', 'This store order ID already exists with a different payload.');
      }
      if (!existingOrder.documentId && existingOrder.status === 'received') await this.finishEligiblePost(actor, existingOrder);
      const receipt = this.orderReceipt(existingOrder, 'accepted_for_processing');
      await this.store.putIdempotency(actor.tenantId, actor.connectionId, idempotencyKey, {
        payloadHash,
        orderId: existingOrder.id,
        receipt,
      });
      return { ...receipt, replayed: true };
    }

    const preview = await this.validateOrder(actor, input);
    let status: OrderStatus = 'received';
    let reviewReason: string | null = null;
    const unrepresentable = this.posting.handlesStoreTax ? null : representabilityIssue(input);
    if (!preview.ok) {
      status = 'needs_review';
      reviewReason = preview.issues.filter((i) => i.blocking).map((i) => i.message).join(' ');
    } else if (unrepresentable) {
      status = 'needs_review';
      reviewReason = unrepresentable;
    } else if (input.payment?.status === 'failed' || input.payment?.status === 'pending') {
      status = 'received';
      reviewReason =
        input.payment.status === 'failed'
          ? 'Payment failed. No inventory or journals were posted.'
          : 'Payment is pending. Inventory is not committed.';
    } else if (actor.postingMode !== 'posting') {
      status = 'needs_review';
      reviewReason = 'Connection posting is in preview. Enable posting after mappings are checked.';
    }

    const stockIssues: string[] = [];
    const reservation = input.reservationId ? await this.store.getReservation?.(actor.tenantId, input.reservationId) : null;
    const reservedLive =
      reservation && reservation.connectionId === actor.connectionId && reservation.status === 'active' && Date.parse(reservation.expiresAt) > Date.now();
    const reservedSkus = new Set(reservedLive ? reservation.lines.filter((l) => l.status === 'held').map((l) => l.sku) : []);
    if (status === 'received' && actor.postingMode === 'posting' && preview.ok && input.payment?.status === 'paid') {
      for (const line of preview.mapped) {
        if (!line.productId) continue;
        if (reservedSkus.has(line.sku)) continue;
        const available = await this.availableQty(actor.tenantId, line.productId, actor.locationId);
        if (available < line.quantity) {
          stockIssues.push(`SKU ${line.sku} needs ${line.quantity}, BookOne has ${available}.`);
        }
      }
      if (stockIssues.length) {
        status = 'needs_review';
        reviewReason = `Oversell under async stock policy (review, no negative stock): ${stockIssues.join(' ')}`;
      }
    }

    const order: OrderRow = {
      id: randomUUID(),
      tenantId: actor.tenantId,
      connectionId: actor.connectionId,
      externalId: input.externalId,
      status,
      reviewReason,
      currency: input.currency,
      total: input.total,
      payloadHash,
      snapshot: input,
      sourceVersion: input.sourceVersion ?? null,
      sourceTimezone: input.sourceTimezone ?? null,
      placedAt: input.placedAt,
      documentId: null,
      documentNumber: null,
      fulfilment: { ...EMPTY_FULFILMENT, shipments: [] },
      lastAppliedVersion: input.sourceVersion ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lines: (input.lines ?? []).map((line) => ({
        id: randomUUID(),
        externalLineId: line.externalLineId,
        sku: line.sku,
        bookoneProductId: preview.mapped.find((m) => m.sku === line.sku)?.productId ?? null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxAmount: line.taxAmount ?? '0',
        discountAmount: line.discountAmount ?? '0',
        restockedQty: '0',
        refundedAmount: '0',
      })),
    };

    await this.store.insertOrder(order);
    let reservationStatus: string | null = null;
    if (input.reservationId) {
      // WP3: the reservation's hold becomes this order's hold, atomically per product row.
      const converted = await this.convertReservation(actor, order, input.reservationId);
      reservationStatus = converted.status;
      if (converted.status === 'converted') {
        if (order.status === 'received' && input.payment?.status === 'pending') order.reviewReason = 'Payment is pending. Stock is held for this order.';
        order.updatedAt = nowIso();
        await this.store.updateOrder(order);
      }
    }
    await this.commitOnReceipt(actor, order, preview);
    const claimed = this.orderReceipt(order, 'accepted_for_processing');
    await this.store.putIdempotency(actor.tenantId, actor.connectionId, idempotencyKey, {
      payloadHash,
      orderId: order.id,
      receipt: claimed,
    });

    if (status === 'received' && actor.postingMode === 'posting' && preview.ok && input.payment?.status === 'paid' && !stockIssues.length) {
      await this.tryPostInvoice(actor, order, preview);
    }

    const receipt = { ...this.orderReceipt(order, 'accepted_for_processing'), ...(input.reservationId ? { reservationId: input.reservationId, reservationStatus } : {}) };
    await this.store.putIdempotency(actor.tenantId, actor.connectionId, idempotencyKey, {
      payloadHash,
      orderId: order.id,
      receipt,
    });
    const connection = await this.requireConnection(actor.tenantId, actor.connectionId);
    connection.lastOrderSyncAt = nowIso();
    const seen = withSeenMethod(connection.paymentSettings, input.payment?.method);
    if (seen) connection.paymentSettings = seen;
    await this.store.updateConnection(connection);
    return receipt;
  }

  async getOrder(actor: CommerceActor, externalId: string) {
    this.need(actor, 'order');
    const order = await this.store.getOrderByExternalId(actor.tenantId, actor.connectionId, externalId);
    if (!order) fail('NOT_FOUND', 'Order was not found.');
    // WP5: the receipt fields plus lines, payment, invoice and shipments.
    return { ...this.orderReceipt(order, order.status), ...orderView(order) };
  }

  async applyEvent(actor: CommerceActor, externalId: string, input: OrderEventInput) {
    this.need(actor, 'lifecycle');
    if (actor.inboundPaused) fail('INBOUND_PAUSED', 'Inbound order events are paused for this connection.');
    const issues = validateEvent(input);
    if (issues.length) fail('VALIDATION', issues[0]!.message, { issues });
    const order = await this.store.getOrderByExternalId(actor.tenantId, actor.connectionId, externalId);
    if (!order) fail('NOT_FOUND', 'Order was not found.');
    if (isStaleVersion(order.lastAppliedVersion, input.sourceVersion)) {
      fail('CONFLICT', 'This event is older than the last applied store version.', {
        lastAppliedVersion: order.lastAppliedVersion,
        sourceVersion: input.sourceVersion,
      });
    }

    const existingEvent = await this.store.getEvent(actor.tenantId, actor.connectionId, input.externalEventId);
    if (existingEvent?.status === 'applied') return this.orderReceipt(order, order.status);

    let eventId = existingEvent?.id;
    if (!existingEvent) {
      eventId = randomUUID();
      const inserted = await this.store.insertEvent({
        id: eventId,
        tenantId: actor.tenantId,
        connectionId: actor.connectionId,
        orderId: order.id,
        externalEventId: input.externalEventId,
        kind: input.kind,
        status: 'received',
        sourceVersion: input.sourceVersion ?? null,
        effectiveAt: input.effectiveAt,
        amount: input.amount ?? null,
        restock: Boolean(input.restock),
        payload: input as unknown as Record<string, unknown>,
        result: null,
      });
      if (inserted === 'duplicate') {
        const raced = await this.store.getEvent(actor.tenantId, actor.connectionId, input.externalEventId);
        if (raced?.status === 'applied') return this.orderReceipt(order, order.status);
        eventId = raced?.id ?? eventId;
      }
    }

    const linesBefore = order.lines.map((line) => ({ ...line }));
    const statusBefore = order.status;
    try {
      if (input.kind === 'cancelled') {
        if (order.documentId && (order.status === 'posted' || order.status === 'partially_refunded' || order.status === 'fulfilled' || order.status === 'paid')) {
          const remaining = order.lines
            .map((line) => ({
              productId: line.bookoneProductId,
              description: `Cancel ${order.externalId}`,
              quantity: Number(line.quantity) - Number(line.restockedQty),
              unitPrice: Number(line.unitPrice),
            }))
            .filter((line) => line.quantity > 0);
          if (remaining.length) {
            await this.postReturnForEvent('Cancellation', {
              actor,
              sourceDocumentId: order.documentId,
              idempotencyKey: `commerce-cancel:${actor.connectionId}:${order.externalId}`,
              issueDate: input.effectiveAt.slice(0, 10),
              restock: true,
              amount: remaining.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
              lines: remaining,
            });
            for (const line of order.lines) line.restockedQty = line.quantity;
            await this.emitStock(
              actor,
              remaining.map((line) => line.productId).filter((id): id is string => Boolean(id)),
            );
          }
        }
        if (order.status === 'posted' || order.status === 'received' || order.status === 'needs_review' || order.status === 'accepted' || order.status === 'partially_refunded') {
          order.status = 'cancelled';
          order.reviewReason = null;
        }
        await this.releaseHold(actor, order);
        if (order.fulfilment) order.fulfilment.status = 'cancelled';
      } else if (input.kind === 'paid') {
        if (order.status === 'received' || order.status === 'needs_review') {
          order.snapshot.payment = { ...(order.snapshot.payment ?? { status: 'paid' }), status: 'paid' };
          if (actor.postingMode === 'posting' && !order.documentId) {
            await this.finishEligiblePost(actor, order);
          } else if (!order.documentId) {
            order.status = 'paid';
          }
        }
      } else if (input.kind === 'fulfilled') {
        if (order.status === 'posted' || order.status === 'paid') order.status = 'fulfilled';
        else {
          holdForReview(order, 'Fulfilment arrived before the order was posted.');
        }
      } else if (input.kind === 'refunded') {
        await this.applyRefund(actor, order, input);
      } else if (input.kind === 'payment_pending_verification') {
        if (input.attachment?.url) {
          order.snapshot.attachments = [...(order.snapshot.attachments ?? []), input.attachment];
        }
        if (order.status === 'received' || order.status === 'needs_review') {
          order.reviewReason = 'Bank slip uploaded. Check the payment, then Mark paid.';
        }
      } else if (input.kind === 'payment_failed') {
        if (order.documentId) fail('CONFLICT', 'This order is already posted as paid. Send a refund instead.');
        order.snapshot.payment = {
          ...(order.snapshot.payment ?? { status: 'failed' }),
          status: 'failed',
          externalRef: input.externalRef ?? order.snapshot.payment?.externalRef,
        };
        await this.releaseHold(actor, order);
        order.reviewReason = `Payment failed${input.reason ? `: ${input.reason}` : ''}. Nothing was posted.`;
      } else if (input.kind === 'address_updated') {
        const shipped = ['shipped', 'out_for_delivery', 'delivered'].includes(order.fulfilment?.status ?? '');
        if (shipped) fail('CONFLICT', 'The order has already been dispatched; the address cannot change.');
        if (!input.shippingAddress) fail('VALIDATION', 'shippingAddress is required.');
        order.snapshot.shippingAddress = input.shippingAddress;
      } else {
        holdForReview(order, `Unsupported lifecycle event ${input.kind} was staged with no accounting effect.`);
      }
      if (eventId) await this.store.updateEvent(eventId, { status: 'applied', result: { status: order.status } });
    } catch (error) {
      if (eventId) {
        await this.store.updateEvent(eventId, {
          status: 'retryable',
          result: { error: error instanceof Error ? error.message : 'Event failed', previousStatus: statusBefore },
        });
      }
      if (!(error instanceof EventPostingError)) throw error;
      // QA-1126-18: BookOne refused the return. Keep the order visible in
      // Activity → needs review (with Retry) instead of failing the shop's call.
      order.lines = linesBefore;
      holdForReview(order, error.message);
      order.updatedAt = nowIso();
      await this.store.updateOrder(order);
      return this.orderReceipt(order, order.status);
    }
    order.lastAppliedVersion = input.sourceVersion ?? order.lastAppliedVersion;
    order.updatedAt = nowIso();
    await this.store.updateOrder(order);
    await this.emitOrder(actor.tenantId, actor.connectionId, order, `event:${input.kind}`);
    return this.orderReceipt(order, order.status);
  }

  async retryReviewOrder(operator: OperatorActor, connectionId: string, orderId: string) {
    this.assertWrite(operator);
    const connection = await this.requireConnection(operator.tenantId, connectionId);
    const orders = await this.store.listOrders(operator.tenantId, connectionId, 'needs_review');
    const order = orders.find((o) => o.id === orderId);
    if (!order) fail('NOT_FOUND', 'Review order was not found.');
    const actor: CommerceActor = {
      tenantId: operator.tenantId,
      connectionId: connection.id,
      credentialId: 'operator-retry',
      userId: connection.createdByUserId,
      locationId: connection.locationId,
      currency: connection.currency,
      environment: connection.environment,
      kind: connection.kind,
      scopes: ['catalog', 'inventory', 'order', 'lifecycle'],
      postingMode: connection.postingMode,
      inboundPaused: connection.inboundPaused,
      outboundPaused: connection.outboundPaused,
      oversellPolicy: connection.oversellPolicy,
      reservationMode: connection.reservationMode,
      prefix: 'operator',
    };
    if (order.documentId) {
      // Posted order held by a refused cancel/refund: replay those events (QA-1126-18).
      const failed = (await this.store.listOrderEvents?.(operator.tenantId, connectionId, order.id)) ?? [];
      const retryable = failed.filter((e) => e.status === 'retryable');
      if (retryable.length) {
        const prior = retryable[0]!.result?.previousStatus;
        order.status = typeof prior === 'string' && prior !== 'needs_review' ? (prior as OrderStatus) : 'posted';
        order.reviewReason = null;
        order.updatedAt = nowIso();
        await this.store.updateOrder(order);
        for (const event of retryable) {
          await this.applyEvent(actor, order.externalId, event.payload as unknown as OrderEventInput);
        }
      }
    } else {
      await this.finishEligiblePost(actor, order);
    }
    const fresh = (await this.store.getOrderByExternalId(operator.tenantId, connectionId, order.externalId)) ?? order;
    await this.audit(operator, connectionId, 'order.retry', 'order', fresh.id, { externalId: fresh.externalId, status: fresh.status });
    return this.orderReceipt(fresh, fresh.status);
  }

  reservations(): never {
    fail('RESERVATION_DISABLED', 'Reservation mode is disabled until a cross-channel contention test passes.');
  }

  private async postReturnForEvent(label: string, input: Parameters<PostingPort['postSalesReturn']>[0]) {
    try {
      return await this.posting.postSalesReturn(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'BookOne could not post the return.';
      throw new EventPostingError(
        `${label} was not booked in BookOne: ${message} Fix the cause, then use Retry.`,
      );
    }
  }

  private async applyRefund(actor: CommerceActor, order: OrderRow, input: OrderEventInput) {
    const amount = parseMoney(input.amount ?? '0', 'Refund amount');
    const already = order.lines.reduce((sum, line) => sum + Number(line.refundedAmount), 0);
    const remaining = Number(order.total) - already;
    if (amount <= 0 || amount - remaining > 0.01) {
      fail('VALIDATION', `Refund amount ${moneyString(amount)} is not valid against remaining ${moneyString(remaining)}.`);
    }
    const externalRefundId = input.externalRefundId ?? input.externalEventId;
    const existingRefund = await this.store.getRefund(actor.tenantId, actor.connectionId, externalRefundId);
    if (existingRefund?.documentId) return;

    let refundId = existingRefund?.id;
    if (!existingRefund) {
      refundId = randomUUID();
      const refundInsert = await this.store.insertRefund({
        id: refundId,
        tenantId: actor.tenantId,
        connectionId: actor.connectionId,
        orderId: order.id,
        externalRefundId,
        amount: moneyString(amount),
        restock: Boolean(input.restock),
        documentId: null,
      });
      if (refundInsert === 'duplicate') {
        const raced = await this.store.getRefund(actor.tenantId, actor.connectionId, externalRefundId);
        if (raced?.documentId) return;
        refundId = raced?.id ?? refundId;
      }
    }

    if (!order.documentId) {
      holdForReview(order, 'Refund arrived before its order was posted. No journals were created.');
      return;
    }

    const returnLines: Array<{ productId: string | null; description: string; quantity: number; unitPrice: number }> = [];
    if (input.restock) {
      if (!input.lines?.length) {
        holdForReview(order, 'Physical restock requires original line references and quantities.');
        return;
      }
      for (const ref of input.lines) {
        const line = order.lines.find((row) => row.externalLineId === ref.externalLineId);
        if (!line) {
          holdForReview(order, `Refund line ${ref.externalLineId} is not on the original order.`);
          return;
        }
        const qty = parseQty(ref.quantity ?? '0', `Restock quantity for ${line.sku}`);
        const alreadyQty = Number(line.restockedQty);
        if (alreadyQty + qty - Number(line.quantity) > 0.0001) {
          fail('VALIDATION', `Cannot restock ${qty} of ${line.sku}; remaining ${Number(line.quantity) - alreadyQty}.`);
        }
        const lineAmount = ref.amount
          ? parseMoney(ref.amount, `Refund amount for ${line.sku}`)
          : qty * Number(line.unitPrice);
        const lineCap = Number(line.quantity) * Number(line.unitPrice) - Number(line.refundedAmount);
        if (lineAmount - lineCap > 0.01) {
          fail('VALIDATION', `Refund amount ${moneyString(lineAmount)} exceeds remaining ${moneyString(lineCap)} on ${line.sku}.`);
        }
        returnLines.push({
          productId: line.bookoneProductId,
          description: line.sku,
          quantity: qty,
          unitPrice: Number(line.unitPrice),
        });
        line.restockedQty = String(alreadyQty + qty);
        line.refundedAmount = moneyString(Number(line.refundedAmount) + lineAmount);
      }
    } else if (input.lines?.length) {
      let allocated = 0;
      for (const ref of input.lines) {
        const line = order.lines.find((row) => row.externalLineId === ref.externalLineId);
        if (!line) {
          holdForReview(order, `Refund line ${ref.externalLineId} is not on the original order.`);
          return;
        }
        const lineAmount = parseMoney(ref.amount ?? '0', `Refund amount for ${line.sku}`);
        const lineCap = Number(line.quantity) * Number(line.unitPrice) - Number(line.refundedAmount);
        if (lineAmount - lineCap > 0.01) {
          fail('VALIDATION', `Refund amount ${moneyString(lineAmount)} exceeds remaining ${moneyString(lineCap)} on ${line.sku}.`);
        }
        line.refundedAmount = moneyString(Number(line.refundedAmount) + lineAmount);
        allocated += lineAmount;
      }
      if (Math.abs(allocated - amount) > 0.01) {
        fail('VALIDATION', `Refund line amounts ${moneyString(allocated)} do not match ${moneyString(amount)}.`);
      }
      returnLines.push({
        productId: null,
        description: `Money-only refund ${order.externalId}`,
        quantity: 1,
        unitPrice: amount,
      });
    } else {
      let leftover = amount;
      for (const line of order.lines) {
        const cap = Number(line.quantity) * Number(line.unitPrice) - Number(line.refundedAmount);
        const take = Math.min(leftover, Math.max(0, cap));
        line.refundedAmount = moneyString(Number(line.refundedAmount) + take);
        leftover -= take;
      }
      returnLines.push({
        productId: null,
        description: `Money-only refund ${order.externalId}`,
        quantity: 1,
        unitPrice: amount,
      });
    }

    const posted = await this.postReturnForEvent('Refund', {
      actor,
      sourceDocumentId: order.documentId,
      idempotencyKey: `commerce-refund:${actor.connectionId}:${externalRefundId}`,
      issueDate: input.effectiveAt.slice(0, 10),
      restock: Boolean(input.restock),
      amount,
      lines: returnLines,
    });
    if (refundId) await this.store.updateRefund(refundId, { documentId: posted.documentId });
    order.status = almostEqualRefund(already + amount, Number(order.total)) ? 'refunded' : 'partially_refunded';
    order.reviewReason = null;
    if (input.restock) {
      await this.emitStock(
        actor,
        returnLines.map((line) => line.productId).filter((id): id is string => Boolean(id)),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // WP3: reservations
  // ---------------------------------------------------------------------------

  /** SKU → BookOne product for everything this channel sells (linked or published). */
  private async sellableSkus(actor: CommerceActor): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const m of await this.store.listMappings(actor.tenantId, actor.connectionId)) {
      out.set(m.sku, m.bookoneProductId);
      if (m.externalProductId) out.set(m.externalProductId, m.bookoneProductId);
    }
    if (this.store.catalogBundle) {
      const b = await this.store.catalogBundle(actor.tenantId, actor.connectionId);
      for (const entry of visibleTree(b, 'published')) {
        for (const p of entry.variants.length ? entry.variants : [entry.product]) {
          if (p.productType !== 'variable' && !out.has(p.sku)) out.set(p.sku, p.id);
        }
      }
    }
    return out;
  }

  private reservationView(r: ReservationRow) {
    return {
      ok: true as const,
      reservationId: r.id,
      externalId: r.externalId,
      status: r.status,
      expiresAt: r.expiresAt,
      partial: r.partial,
      orderId: r.orderId,
      lines: r.lines,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      requestId: randomUUID(),
    };
  }

  private async emitReservation(actor: CommerceActor, r: ReservationRow, action: string) {
    await this.emitCatalogEvent(actor.tenantId, actor.connectionId, 'reservation', null, null, {
      reservationId: r.id,
      externalId: r.externalId,
      action,
      status: r.status,
      expiresAt: r.expiresAt,
      lines: r.lines.map((l) => ({ sku: l.sku, quantity: l.quantity, held: l.held, status: l.status })),
    });
    const ids = r.lines.map((l) => l.productId).filter((id): id is string => Boolean(id));
    if (ids.length) await this.emitStock(actor, ids);
  }

  private ttl(raw: unknown): number {
    if (raw === undefined || raw === null || raw === '') return 900;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 60 || n > 3600) fail('VALIDATION', 'ttlSeconds must be a whole number from 60 to 3600.');
    return n;
  }

  private async holdLines(
    actor: CommerceActor,
    reservationId: string,
    rawLines: Array<{ sku: string; quantity: string | number }>,
    partial: boolean,
    expiresAt: string,
  ) {
    if (!this.store.holdReservation) fail('RESERVATION_DISABLED', 'Reservations are not available on this server.');
    if (!Array.isArray(rawLines) || !rawLines.length) fail('VALIDATION', 'Pass at least one line.');
    if (rawLines.length > 100) fail('VALIDATION', 'A reservation can have at most 100 lines.');
    const skus = await this.sellableSkus(actor);
    const lines: ReservationRow['lines'] = rawLines.map((l) => {
      const quantity = parseQty(String(l.quantity), `Quantity for ${l.sku}`);
      if (quantity <= 0) fail('VALIDATION', `Quantity for ${l.sku} must be more than 0.`);
      const productId = skus.get(String(l.sku ?? '').trim()) ?? null;
      return { sku: String(l.sku), productId, quantity: qtyString(quantity), held: '0', available: '0', status: productId ? 'held' : 'unknown_sku' };
    });
    const known = lines.filter((l) => l.productId);
    if (!partial && known.length !== lines.length) {
      return { ok: false, lines };
    }
    const result = await this.store.holdReservation({
      tenantId: actor.tenantId,
      connectionId: actor.connectionId,
      reservationId,
      locationId: actor.locationId,
      expiresAt,
      partial,
      lines: known.map((l) => ({ productId: l.productId as string, quantity: Number(l.quantity) })),
    });
    // Spread each product's held quantity back over its lines.
    const left = new Map(result.lines.map((x) => [x.productId, { held: x.held, available: x.available }]));
    for (const l of lines) {
      if (!l.productId) continue;
      const slot = left.get(l.productId);
      const want = Number(l.quantity);
      const got = Math.min(want, slot?.held ?? 0);
      if (slot) slot.held -= got;
      l.held = qtyString(got);
      l.available = qtyString(slot?.available ?? 0);
      l.status = got + 1e-9 >= want ? 'held' : 'insufficient';
    }
    return { ok: result.ok && known.length === lines.length, lines };
  }

  /** POST /reservations: hold stock while the customer pays (default 15 minutes, max 60). */
  async createReservation(
    actor: CommerceActor,
    input: { externalId?: string; lines?: Array<{ sku: string; quantity: string | number }>; ttlSeconds?: number; partial?: boolean },
  ) {
    this.need(actor, 'inventory');
    if (!this.store.insertReservation) fail('RESERVATION_DISABLED', 'Reservations are not available on this server.');
    const externalId = String(input.externalId ?? '').trim();
    if (!externalId) fail('VALIDATION', 'externalId (your checkout id) is required.');
    await this.expireReservations(actor.tenantId);
    const existing = ((await this.store.listReservations?.(actor.tenantId, actor.connectionId, 'active')) ?? []).find(
      (r) => r.externalId === externalId,
    );
    if (existing) return { ...this.reservationView(existing), replayed: true };
    const ttl = this.ttl(input.ttlSeconds);
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    const partial = Boolean(input.partial);
    const row: ReservationRow = {
      id: randomUUID(),
      tenantId: actor.tenantId,
      connectionId: actor.connectionId,
      externalId: externalId.slice(0, 120),
      status: 'active',
      locationId: actor.locationId,
      partial,
      lines: [],
      orderId: null,
      expiresAt,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await this.store.insertReservation(row);
    const held = await this.holdLines(actor, row.id, input.lines ?? [], partial, expiresAt);
    row.lines = held.lines;
    const anyHeld = held.lines.some((l) => Number(l.held) > 0);
    if (!anyHeld || (!partial && !held.ok)) {
      row.status = 'released';
      await this.store.releaseReservationHolds?.(actor.tenantId, row.id, 'released');
    }
    row.updatedAt = nowIso();
    await this.store.updateReservation?.(row);
    if (row.status === 'active') await this.emitReservation(actor, row, 'held');
    return { ...this.reservationView(row), held: row.status === 'active' };
  }

  async getReservation(actor: CommerceActor, id: string) {
    this.need(actor, 'inventory');
    await this.expireReservations(actor.tenantId);
    const r = await this.store.getReservation?.(actor.tenantId, id);
    if (!r || r.connectionId !== actor.connectionId) fail('NOT_FOUND', 'Reservation was not found.');
    return this.reservationView(r);
  }

  /** PATCH /reservations/{id}: extend the time and/or change the lines. */
  async updateReservation(
    actor: CommerceActor,
    id: string,
    input: { ttlSeconds?: number; lines?: Array<{ sku: string; quantity: string | number }> },
  ) {
    this.need(actor, 'inventory');
    await this.expireReservations(actor.tenantId);
    const r = await this.store.getReservation?.(actor.tenantId, id);
    if (!r || r.connectionId !== actor.connectionId) fail('NOT_FOUND', 'Reservation was not found.');
    if (r.status !== 'active') fail('CONFLICT', `This reservation is ${r.status}.`);
    const expiresAt = input.ttlSeconds !== undefined ? new Date(Date.now() + this.ttl(input.ttlSeconds) * 1000).toISOString() : r.expiresAt;
    if (input.lines) {
      const before = r.lines;
      await this.store.releaseReservationHolds?.(actor.tenantId, r.id, 'released');
      const held = await this.holdLines(actor, r.id, input.lines, r.partial, expiresAt);
      if (!r.partial && !held.ok) {
        // Put the old hold back and refuse the change.
        await this.store.releaseReservationHolds?.(actor.tenantId, r.id, 'released');
        const back = await this.holdLines(actor, r.id, before.map((l) => ({ sku: l.sku, quantity: l.held })).filter((l) => Number(l.quantity) > 0), true, expiresAt);
        r.lines = back.lines;
        r.expiresAt = expiresAt;
        r.updatedAt = nowIso();
        await this.store.updateReservation?.(r);
        fail('INSUFFICIENT_STOCK', 'Not enough stock for the new quantities. The previous hold is kept.', { lines: held.lines });
      }
      r.lines = held.lines;
    } else {
      await this.store.extendReservationHolds?.(actor.tenantId, r.id, expiresAt);
    }
    r.expiresAt = expiresAt;
    r.updatedAt = nowIso();
    await this.store.updateReservation?.(r);
    await this.emitReservation(actor, r, 'updated');
    return this.reservationView(r);
  }

  async releaseReservation(actor: CommerceActor, id: string) {
    this.need(actor, 'inventory');
    const r = await this.store.getReservation?.(actor.tenantId, id);
    if (!r || r.connectionId !== actor.connectionId) fail('NOT_FOUND', 'Reservation was not found.');
    if (r.status !== 'active') return this.reservationView(r);
    await this.store.releaseReservationHolds?.(actor.tenantId, r.id, 'released');
    r.status = 'released';
    r.updatedAt = nowIso();
    await this.store.updateReservation?.(r);
    await this.emitReservation(actor, r, 'released');
    return this.reservationView(r);
  }

  /** Mark reservations past their time as expired (their holds already stopped counting). */
  async expireReservations(tenantId: string) {
    if (!this.store.listReservations) return 0;
    const now = Date.now();
    let n = 0;
    for (const r of await this.store.listReservations(tenantId, null, 'active')) {
      if (Date.parse(r.expiresAt) > now) continue;
      await this.store.releaseReservationHolds?.(tenantId, r.id, 'released');
      r.status = 'expired';
      r.updatedAt = nowIso();
      await this.store.updateReservation?.(r);
      const connection = await this.store.getConnection(tenantId, r.connectionId);
      if (connection) {
        const actor = this.actorFromConnection(connection);
        await this.emitReservation(actor, r, 'expired');
      }
      n += 1;
    }
    return n;
  }

  /** Converts an active reservation into this order's hold. Returns the SKUs it covers. */
  private async convertReservation(actor: CommerceActor, order: OrderRow, reservationId: string) {
    const r = await this.store.getReservation?.(actor.tenantId, reservationId);
    if (!r || r.connectionId !== actor.connectionId) return { status: 'not_found' as const, skus: new Set<string>() };
    if (r.status !== 'active' || Date.parse(r.expiresAt) <= Date.now()) return { status: r.status === 'active' ? 'expired' as const : r.status, skus: new Set<string>() };
    const moved = (await this.store.transferReservationToOrder?.(actor.tenantId, r.id, order.id)) ?? 0;
    if (!moved) return { status: 'expired' as const, skus: new Set<string>() };
    r.status = 'converted';
    r.orderId = order.id;
    r.updatedAt = nowIso();
    await this.store.updateReservation?.(r);
    order.fulfilment = { ...(order.fulfilment ?? EMPTY_FULFILMENT), stock: 'committed' };
    await this.emitCatalogEvent(actor.tenantId, actor.connectionId, 'reservation', null, null, {
      reservationId: r.id,
      externalId: r.externalId,
      action: 'converted',
      status: r.status,
      orderExternalId: order.externalId,
    });
    return { status: 'converted' as const, skus: new Set(r.lines.filter((l) => l.status === 'held').map((l) => l.sku)) };
  }

  private actorFromConnection(connection: ConnectionRow): CommerceActor {
    return {
      tenantId: connection.tenantId,
      connectionId: connection.id,
      credentialId: 'system',
      userId: connection.createdByUserId,
      locationId: connection.locationId,
      currency: connection.currency,
      environment: connection.environment,
      kind: connection.kind,
      scopes: ['catalog', 'inventory', 'order', 'lifecycle'],
      postingMode: connection.postingMode,
      inboundPaused: false,
      outboundPaused: connection.outboundPaused,
      oversellPolicy: connection.oversellPolicy,
      reservationMode: connection.reservationMode,
      prefix: 'system',
    };
  }

  // ---------------------------------------------------------------------------
  // WP4: webhooks
  // ---------------------------------------------------------------------------

  /** Feed item shape shared by /changes and webhooks. */
  static feedItem(row: OutboxRow) {
    const p = row.payload ?? {};
    const entityId =
      row.productId ??
      (p.reservationId as string | undefined) ??
      (p.customerId as string | undefined) ??
      (p.externalId as string | undefined) ??
      (p.categoryId as string | undefined) ??
      (p.brandId as string | undefined) ??
      null;
    return { ...row, entityId, occurredAt: row.createdAt };
  }

  private webhookView(w: WebhookRow) {
    return {
      id: w.id,
      url: w.url,
      kinds: w.kinds,
      status: w.status,
      lastSuccessAt: w.lastSuccessAt,
      failingSince: w.failingSince,
      lastError: w.lastError,
      rotationOverlapUntil: w.previousExpiresAt && Date.parse(w.previousExpiresAt) > Date.now() ? w.previousExpiresAt : null,
      createdAt: w.createdAt,
    };
  }

  private async requireWebhook(tenantId: string, connectionId: string, id: string) {
    const w = ((await this.store.listWebhooks?.(tenantId, connectionId)) ?? []).find((x) => x.id === id);
    if (!w) fail('NOT_FOUND', 'Webhook was not found.');
    return w;
  }

  async listWebhooks(tenantId: string, connectionId: string) {
    return ((await this.store.listWebhooks?.(tenantId, connectionId)) ?? []).map((w) => this.webhookView(w));
  }

  /** Register an endpoint. The signing secret is returned once. */
  async createWebhook(tenantId: string, connectionId: string, input: { url?: string; kinds?: unknown }) {
    if (!this.store.insertWebhook) fail('NOT_FOUND', 'Webhooks are not available on this server.');
    const connection = await this.requireConnection(tenantId, connectionId);
    let url: string;
    let kinds: string[];
    try {
      url = validateWebhookUrl(String(input.url ?? ''), connection.environment);
      kinds = parseKinds(input.kinds ?? []);
    } catch (e) {
      fail('VALIDATION', e instanceof Error ? e.message : 'Invalid webhook.');
    }
    const existing = (await this.store.listWebhooks?.(tenantId, connectionId)) ?? [];
    if (existing.length >= 5) fail('VALIDATION', 'A connection can have at most 5 webhooks.');
    const secret = newWebhookSecret();
    const row: WebhookRow = {
      id: randomUUID(),
      tenantId,
      connectionId,
      url,
      kinds,
      secretEnc: encryptSecret(secret, this.pepper),
      previousSecretEnc: null,
      previousExpiresAt: null,
      status: 'active',
      // Only changes from now on; use /changes to catch up on history.
      lastRevision: await this.store.maxRevision(tenantId, connectionId),
      failingSince: null,
      lastSuccessAt: null,
      lastError: null,
      createdAt: nowIso(),
    };
    await this.store.insertWebhook(row);
    return { ...this.webhookView(row), secret, requestId: randomUUID() };
  }

  async deleteWebhook(tenantId: string, connectionId: string, id: string) {
    const w = await this.requireWebhook(tenantId, connectionId, id);
    await this.store.updateWebhook?.({ ...w, voided: true, status: 'disabled' });
    return { ok: true as const, id, deleted: true, requestId: randomUUID() };
  }

  /** New secret; the old one keeps signing (second v1=) for 24 hours. */
  async rotateWebhookSecret(tenantId: string, connectionId: string, id: string) {
    const w = await this.requireWebhook(tenantId, connectionId, id);
    const secret = newWebhookSecret();
    const next: WebhookRow = {
      ...w,
      previousSecretEnc: w.secretEnc,
      previousExpiresAt: new Date(Date.now() + WEBHOOK_ROTATION_OVERLAP_MS).toISOString(),
      secretEnc: encryptSecret(secret, this.pepper),
    };
    await this.store.updateWebhook?.(next);
    return { ...this.webhookView(next), secret, requestId: randomUUID() };
  }

  /** Re-enable a failing endpoint (pending deliveries are retried now). */
  async enableWebhook(tenantId: string, connectionId: string, id: string) {
    const w = await this.requireWebhook(tenantId, connectionId, id);
    await this.store.updateWebhook?.({ ...w, status: 'active', failingSince: null, lastError: null });
    return this.webhookView({ ...w, status: 'active', failingSince: null, lastError: null });
  }

  /** POST /webhooks/{id}/test: queue a `ping` delivery now. */
  async testWebhook(tenantId: string, connectionId: string, id: string) {
    const w = await this.requireWebhook(tenantId, connectionId, id);
    const item = {
      id: `ping_${randomUUID()}`,
      revision: 0,
      kind: 'ping',
      entityId: null,
      productId: null,
      sku: null,
      payload: { message: 'BookOne webhook test', connectionId },
      createdAt: nowIso(),
      occurredAt: nowIso(),
    };
    const delivery = this.newDelivery(w, item);
    await this.store.insertDeliveries?.([delivery]);
    return { ok: true as const, queued: true, deliveryId: delivery.id, requestId: randomUUID() };
  }

  async webhookDeliveries(tenantId: string, connectionId: string, id: string, limit = 50) {
    await this.requireWebhook(tenantId, connectionId, id);
    const rows = (await this.store.listDeliveries?.(tenantId, id, Math.min(200, limit))) ?? [];
    return rows.map((d) => ({
      id: d.id,
      itemId: d.itemId,
      kind: d.kind,
      revision: d.revision,
      status: d.status,
      attempts: d.attempts,
      lastStatusCode: d.lastStatusCode,
      lastError: d.lastError,
      nextAttemptAt: d.status === 'pending' ? d.nextAttemptAt : null,
      deliveredAt: d.deliveredAt,
      createdAt: d.createdAt,
    }));
  }

  private newDelivery(w: WebhookRow, item: { id: string; revision: number; kind: string }): DeliveryRow {
    return {
      id: randomUUID(),
      tenantId: w.tenantId,
      webhookId: w.id,
      itemId: item.id,
      revision: item.revision,
      kind: item.kind,
      body: JSON.stringify(item),
      status: 'pending',
      attempts: 0,
      nextAttemptAt: nowIso(),
      firstAttemptAt: null,
      lastStatusCode: null,
      lastError: null,
      deliveredAt: null,
      createdAt: nowIso(),
    };
  }

  /**
   * Background step for one company: expire reservations, queue new feed items
   * for each webhook, and send due deliveries. `send` does the HTTP POST.
   */
  async runBackground(
    tenantId: string,
    send: (url: string, body: string, headers: Record<string, string>) => Promise<{ status: number; error?: string }>,
  ) {
    await this.expireReservations(tenantId).catch(() => 0);
    if (!this.store.listWebhooks || !this.store.insertDeliveries || !this.store.listDueDeliveries) return { queued: 0, sent: 0 };
    let queued = 0;
    const hooks = (await this.store.listWebhooks(tenantId, null)).filter((w) => w.status !== 'disabled');
    for (const w of hooks) {
      let after = w.lastRevision;
      for (let page = 0; page < 10; page++) {
        const rows = await this.store.listOutbox(tenantId, w.connectionId, after, PAGE_SIZE);
        if (!rows.length) break;
        const items = rows.map((r) => CommerceService.feedItem(r)).filter((i) => kindMatches(w.kinds, i));
        if (items.length) await this.store.insertDeliveries(items.map((i) => this.newDelivery(w, i)));
        queued += items.length;
        after = rows[rows.length - 1]!.revision;
        if (rows.length < PAGE_SIZE) break;
      }
      if (after !== w.lastRevision) await this.store.updateWebhook?.({ ...w, lastRevision: after });
    }
    let sent = 0;
    const due = await this.store.listDueDeliveries(tenantId, nowIso(), 50);
    const byId = new Map(((await this.store.listWebhooks(tenantId, null)) ?? []).map((w) => [w.id, w]));
    for (const d of due) {
      const w = byId.get(d.webhookId);
      if (!w || w.status === 'disabled') {
        await this.store.updateDelivery?.({ ...d, status: 'failed', lastError: 'Webhook removed.' });
        continue;
      }
      const secrets = [decryptSecret(w.secretEnc, this.pepper)];
      if (w.previousSecretEnc && w.previousExpiresAt && Date.parse(w.previousExpiresAt) > Date.now()) {
        secrets.push(decryptSecret(w.previousSecretEnc, this.pepper));
      }
      const t = Math.floor(Date.now() / 1000);
      const result = await send(w.url, d.body, {
        'Content-Type': 'application/json',
        'User-Agent': 'BookOne-Webhooks/1',
        'X-BookOne-Signature': signWebhook(secrets, d.body, t),
        'X-BookOne-Event-Id': d.itemId,
        'X-BookOne-Kind': d.kind,
        'X-BookOne-Delivery': d.id,
      }).catch((e: unknown) => ({ status: 0, error: e instanceof Error ? e.message : 'Request failed' }));
      sent += 1;
      const first = d.firstAttemptAt ?? nowIso();
      const attempts = d.attempts + 1;
      if (result.status >= 200 && result.status < 300) {
        await this.store.updateDelivery?.({ ...d, attempts, firstAttemptAt: first, status: 'delivered', lastStatusCode: result.status, lastError: null, deliveredAt: nowIso() });
        if (w.status === 'failing' || w.lastError) {
          w.status = 'active';
          w.failingSince = null;
          w.lastError = null;
        }
        w.lastSuccessAt = nowIso();
        await this.store.updateWebhook?.(w);
      } else {
        const error = result.error ?? `HTTP ${result.status}`;
        const gaveUp = Date.now() - Date.parse(first) >= WEBHOOK_RETRY_WINDOW_MS;
        await this.store.updateDelivery?.({
          ...d,
          attempts,
          firstAttemptAt: first,
          status: gaveUp ? 'failed' : 'pending',
          lastStatusCode: result.status || null,
          lastError: error.slice(0, 500),
          nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
        });
        w.lastError = error.slice(0, 500);
        if (gaveUp) {
          w.status = 'failing';
          w.failingSince = w.failingSince ?? nowIso();
        }
        await this.store.updateWebhook?.(w);
      }
    }
    return { queued, sent };
  }

  // ---------------------------------------------------------------------------
  // WP5: orders
  // ---------------------------------------------------------------------------

  /** GET /orders: this channel's orders, newest change first, for reconciliation. */
  async listOrdersForChannel(
    actor: CommerceActor,
    query: { updatedSince?: string | null; status?: string | null; cursor?: string | null; limit?: number },
  ) {
    this.need(actor, 'order');
    if (query.updatedSince && !Number.isFinite(Date.parse(query.updatedSince))) fail('VALIDATION', 'updatedSince must be an ISO 8601 timestamp.');
    const since = query.updatedSince ? Date.parse(query.updatedSince) : 0;
    const rows = (await this.store.listOrders(actor.tenantId, actor.connectionId, query.status ?? undefined))
      .filter((o) => Date.parse(o.updatedAt) >= since)
      .sort((a, b) => (a.updatedAt === b.updatedAt ? a.id.localeCompare(b.id) : a.updatedAt < b.updatedAt ? -1 : 1));
    const page = pageOf(rows, query.cursor, query.limit);
    return { items: page.items.map((o) => orderView(o)), nextCursor: page.nextCursor, requestId: randomUUID() };
  }

  /** GET /orders/{externalId}/invoice: number, date, total and a public link (print or save as PDF). */
  async orderInvoice(actor: CommerceActor, externalId: string) {
    this.need(actor, 'order');
    const order = await this.store.getOrderByExternalId(actor.tenantId, actor.connectionId, externalId);
    if (!order) fail('NOT_FOUND', 'Order was not found.');
    if (!order.documentId) fail('NOT_FOUND', 'This order has no invoice yet.');
    const link = await this.posting.invoiceLink?.(actor.tenantId, order.documentId);
    if (!link) fail('NOT_FOUND', 'The invoice was not found.');
    return { documentNumber: link.documentNumber, issuedAt: link.issuedAt, total: link.total, pdfUrl: link.url, url: link.url, requestId: randomUUID() };
  }

  /** POST /orders/{externalId}/returns: a return with lines, optionally put back into stock. */
  async createReturn(
    actor: CommerceActor,
    externalId: string,
    input: {
      externalReturnId?: string;
      restock?: boolean;
      effectiveAt?: string;
      lines?: Array<{ externalLineId: string; quantity: string; reason?: string; condition?: string }>;
    },
  ) {
    this.need(actor, 'lifecycle');
    const returnId = String(input.externalReturnId ?? '').trim();
    if (!returnId) fail('VALIDATION', 'externalReturnId is required.');
    const order = await this.store.getOrderByExternalId(actor.tenantId, actor.connectionId, externalId);
    if (!order) fail('NOT_FOUND', 'Order was not found.');
    if (!input.lines?.length) fail('VALIDATION', 'Pass the returned lines.');
    let amount = 0;
    const lines = input.lines.map((l) => {
      const line = order.lines.find((x) => x.externalLineId === l.externalLineId);
      if (!line) fail('VALIDATION', `Line ${l.externalLineId} is not on this order.`);
      const qty = parseQty(String(l.quantity), `Quantity for line ${l.externalLineId}`);
      const perUnit = (Number(line.unitPrice) * Number(line.quantity) - Number(line.discountAmount || 0)) / (Number(line.quantity) || 1);
      const lineAmount = Math.round(perUnit * qty * 100) / 100;
      amount += lineAmount;
      return { externalLineId: l.externalLineId, quantity: qtyString(qty), amount: lineAmount.toFixed(2) };
    });
    const receipt = await this.applyEvent(actor, externalId, {
      externalEventId: `return:${returnId}`,
      kind: 'refunded',
      externalRefundId: returnId,
      effectiveAt: input.effectiveAt ?? nowIso(),
      restock: Boolean(input.restock),
      amount: amount.toFixed(2),
      lines,
    });
    return { ...receipt, externalReturnId: returnId, amount: amount.toFixed(2), restock: Boolean(input.restock) };
  }

  /** Staff: the parcel came back (no accounting; use Refund for money and stock). */
  async markWebOrderReturned(operator: OperatorActor, connectionId: string, orderId: string) {
    this.assertWrite(operator);
    const order = await this.requireWebOrder(operator, connectionId, orderId);
    const f = order.fulfilment ?? { ...EMPTY_FULFILMENT, shipments: [] };
    if (!['shipped', 'out_for_delivery', 'delivered'].includes(f.status)) fail('CONFLICT', 'Only a dispatched order can be marked returned.');
    f.status = 'returned';
    order.fulfilment = f;
    return this.saveStaffChange(operator, connectionId, order, 'returned');
  }

  // ---------------------------------------------------------------------------
  // WP6: customers
  // ---------------------------------------------------------------------------

  private customerView(c: CustomerRow) {
    return {
      customerId: c.id,
      channelCustomerId: c.channelCustomerId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      addresses: c.addresses,
      marketingOptIn: c.marketingOptIn,
      customerGroup: c.customerGroup,
      bookoneCustomer: Boolean(c.partyId),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  /** PUT /customers/{channelCustomerId}: upsert on sign-up or profile edit. */
  async upsertChannelCustomer(
    actor: CommerceActor,
    channelCustomerId: string,
    input: {
      name?: string;
      email?: string | null;
      phone?: string | null;
      addresses?: Array<Record<string, unknown>>;
      marketingOptIn?: boolean;
      customerGroup?: string | null;
    },
  ) {
    this.need(actor, 'order');
    if (!this.store.upsertCustomer || !this.store.getCustomer) fail('NOT_FOUND', 'Customers are not available on this server.');
    const channelId = channelCustomerId.trim();
    if (!channelId) fail('VALIDATION', 'channelCustomerId is required.');
    const name = String(input.name ?? '').trim();
    if (name.length < 1) fail('VALIDATION', 'Customer name is required.');
    const email = input.email ? String(input.email).trim().toLowerCase() : null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('VALIDATION', 'Email is not valid.');
    const phone = input.phone ? String(input.phone).trim() : null;
    const addresses = Array.isArray(input.addresses) ? input.addresses.slice(0, 10) : [];
    const existing = await this.store.getCustomer(actor.tenantId, actor.connectionId, { channelCustomerId: channelId });
    const first = addresses[0] as Address | undefined;
    const party = await this.posting.upsertCustomerParty?.({
      actor,
      partyId: existing?.partyId ?? null,
      name,
      email,
      phone,
      address: first ? addressText(first) : null,
    });
    const row: CustomerRow = {
      id: existing?.id ?? randomUUID(),
      tenantId: actor.tenantId,
      connectionId: actor.connectionId,
      channelCustomerId: channelId.slice(0, 120),
      partyId: party?.partyId ?? existing?.partyId ?? null,
      name: name.slice(0, 200),
      email,
      phone,
      addresses,
      marketingOptIn: Boolean(input.marketingOptIn),
      customerGroup: input.customerGroup ? String(input.customerGroup).trim().toLowerCase().slice(0, 40) : null,
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    await this.store.upsertCustomer(row);
    await this.emitCatalogEvent(actor.tenantId, actor.connectionId, 'customer', null, null, {
      customerId: row.id,
      channelCustomerId: row.channelCustomerId,
      action: existing ? 'updated' : 'created',
    });
    return {
      ...this.customerView(row),
      created: !existing,
      matchedExisting: Boolean(party?.matchedExisting),
      requestId: randomUUID(),
    };
  }

  private async requireCustomer(actor: CommerceActor, id: string) {
    const c =
      (await this.store.getCustomer?.(actor.tenantId, actor.connectionId, { id })) ??
      (await this.store.getCustomer?.(actor.tenantId, actor.connectionId, { channelCustomerId: id }));
    if (!c) fail('NOT_FOUND', 'Customer was not found.');
    return c;
  }

  async getChannelCustomer(actor: CommerceActor, id: string) {
    this.need(actor, 'order');
    return { ...this.customerView(await this.requireCustomer(actor, id)), requestId: randomUUID() };
  }

  /** Website orders plus in-store (POS / BookOne) invoices of the same customer. */
  async channelCustomerOrders(actor: CommerceActor, id: string) {
    this.need(actor, 'order');
    const c = await this.requireCustomer(actor, id);
    const web = (await this.store.listOrders(actor.tenantId, actor.connectionId)).filter(
      (o) => o.snapshot.channelCustomerId === c.channelCustomerId || o.snapshot.customerId === c.id,
    );
    const webDocs = new Set(web.map((o) => o.documentId).filter(Boolean));
    const store = c.partyId && this.posting.partyInvoices ? await this.posting.partyInvoices(actor.tenantId, c.partyId) : [];
    return {
      items: [
        ...web.map((o) => ({ source: 'web' as const, ...orderView(o) })),
        ...store
          .filter((d) => !webDocs.has(d.documentId))
          .map((d) => ({
            source: d.channel === 'pos' ? ('pos' as const) : ('store' as const),
            documentNumber: d.documentNumber,
            placedAt: d.issueDate,
            total: d.total,
            status: d.status,
          })),
      ],
      nextCursor: null,
      requestId: randomUUID(),
    };
  }

  // ---------------------------------------------------------------------------
  // WP7: stats, related, new arrivals, API log
  // ---------------------------------------------------------------------------

  /** include=stats: units sold (all channels incl. POS) on each product; a listing sums its variants. */
  private async attachStats(tenantId: string, b: CatalogBundle, items: Array<Record<string, unknown>>) {
    if (!this.store.salesStats || !items.length) return;
    const tree = new Map(visibleTree(b, 'all').map((e) => [e.product.id, e.variants.map((v) => v.id)]));
    const ids = new Set<string>();
    for (const item of items) {
      ids.add(String(item.id));
      for (const v of tree.get(String(item.id)) ?? []) ids.add(v);
    }
    const stats = await this.store.salesStats(tenantId, [...ids]);
    const sum = (list: string[]) =>
      list.reduce(
        (acc, id) => {
          const s = stats.get(id);
          return s ? { d30: acc.d30 + s.d30, d90: acc.d90 + s.d90, all: acc.all + s.all } : acc;
        },
        { d30: 0, d90: 0, all: 0 },
      );
    for (const item of items) {
      const variants = tree.get(String(item.id)) ?? [];
      const s = sum([String(item.id), ...variants]);
      item.stats = { unitsSold30d: qtyString(s.d30), unitsSold90d: qtyString(s.d90), unitsSoldAllTime: qtyString(s.all) };
      if (Array.isArray(item.variants)) {
        for (const v of item.variants as Array<Record<string, unknown>>) {
          const vs = sum([String(v.id)]);
          v.stats = { unitsSold30d: qtyString(vs.d30), unitsSold90d: qtyString(vs.d90), unitsSoldAllTime: qtyString(vs.all) };
        }
      }
    }
  }

  /** GET /catalog/related?sku=: products often bought with this one. */
  async relatedProducts(actor: CommerceActor, sku: string, include: CatalogInclude[], mediaBase: string, limit = 8) {
    this.need(actor, 'catalog');
    const b = await this.bundle(actor.tenantId, actor.connectionId);
    const self = findCatalogProduct(b, { sku }, [], mediaBase, 'published');
    if (!self) fail('NOT_FOUND', 'Product was not found on this channel.');
    const raw = b.products.find((p) => p.sku === sku);
    const ids = raw ? ((await this.store.relatedProductIds?.(actor.tenantId, raw.id, 50)) ?? []) : [];
    const seen = new Set<string>([self.id]);
    const items = [];
    for (const id of ids) {
      const found = findCatalogProduct(b, { id }, include, mediaBase, 'published');
      if (!found || seen.has(found.id)) continue;
      seen.add(found.id);
      items.push(found);
      if (items.length >= Math.min(24, Math.max(1, limit))) break;
    }
    return { items, nextCursor: null, requestId: randomUUID() };
  }

  /** GET /catalog/new-arrivals?days=30: published products created in the last N days. */
  async newArrivals(actor: CommerceActor, days: number, include: CatalogInclude[], mediaBase: string, cursor?: string | null, limit?: number) {
    this.need(actor, 'catalog');
    if (!Number.isFinite(days) || days < 1 || days > 365) fail('VALIDATION', 'days must be from 1 to 365.');
    const b = await this.bundle(actor.tenantId, actor.connectionId);
    const since = Date.now() - days * 86_400_000;
    const entries = visibleTree(b, 'published')
      .filter((e) => Date.parse(e.product.createdAt) >= since)
      .sort((a, b2) => (a.product.createdAt < b2.product.createdAt ? 1 : -1));
    const page = pageOf(entries, cursor, limit);
    const inc = new Set(include);
    return { items: page.items.map((e) => buildProduct(e, b, inc, mediaBase)), nextCursor: page.nextCursor, requestId: randomUUID() };
  }

  /** G4: Idempotency-Key on any write. Returns the stored response for a replay. */
  async idempotentReplay(actor: CommerceActor, scopeKey: string, body: unknown) {
    const key = `w:${stableHash(scopeKey).slice(0, 60)}`;
    const hit = await this.store.getIdempotency(actor.tenantId, actor.connectionId, key);
    if (!hit) return null;
    if (hit.payloadHash !== stableHash(body ?? {})) fail('CONFLICT', 'This Idempotency-Key was already used with a different payload.');
    return { ...hit.receipt, replayed: true };
  }

  async rememberIdempotent(actor: CommerceActor, scopeKey: string, body: unknown, response: Record<string, unknown>) {
    const key = `w:${stableHash(scopeKey).slice(0, 60)}`;
    await this.store.putIdempotency(actor.tenantId, actor.connectionId, key, { payloadHash: stableHash(body ?? {}), orderId: null, receipt: response });
  }

  async logApiCall(row: Omit<ApiCallRow, 'id' | 'createdAt'>) {
    await this.store.insertApiCall?.({ ...row, id: randomUUID(), createdAt: nowIso() });
  }

  /** Developer tab: held checkouts on this connection (active first). */
  async reservationsForOperator(operator: OperatorActor, connectionId: string) {
    await this.requireConnection(operator.tenantId, connectionId);
    await this.expireReservations(operator.tenantId).catch(() => 0);
    const rows = (await this.store.listReservations?.(operator.tenantId, connectionId)) ?? [];
    return rows.slice(0, 50).map((r) => ({
      id: r.id,
      externalId: r.externalId,
      status: r.status,
      expiresAt: r.expiresAt,
      lines: r.lines.map((l) => ({ sku: l.sku, quantity: l.quantity, held: l.held, status: l.status })),
      createdAt: r.createdAt,
    }));
  }

  /** Developer tab: webhooks with their latest deliveries. */
  async webhooksForOperator(operator: OperatorActor, connectionId: string) {
    const hooks = await this.listWebhooks(operator.tenantId, connectionId);
    const out = [];
    for (const w of hooks) out.push({ ...w, deliveries: await this.webhookDeliveries(operator.tenantId, connectionId, w.id, 20) });
    return out;
  }

  async apiCallsForOperator(operator: OperatorActor, connectionId: string, limit = 100) {
    await this.requireConnection(operator.tenantId, connectionId);
    return (await this.store.listApiCalls?.(operator.tenantId, connectionId, Math.min(500, limit))) ?? [];
  }

  // ---------------------------------------------------------------------------
  // WP2: pricing
  // ---------------------------------------------------------------------------

  /** PR4: fast price re-check for up to 100 SKUs (product or variant), e.g. at checkout. */
  async pricing(actor: CommerceActor, skus: string[], customerGroup?: string | null) {
    this.need(actor, 'catalog');
    const wanted = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
    if (!wanted.length) fail('VALIDATION', 'Pass at least one sku.');
    if (wanted.length > 100) fail('VALIDATION', 'Pass at most 100 SKUs per call.');
    const b = await this.bundle(actor.tenantId, actor.connectionId);
    const list = activeList(b, customerGroup);
    const sellable = new Map<string, CatalogBundle['products'][number]>();
    for (const entry of visibleTree(b, 'published')) {
      for (const p of entry.variants.length ? entry.variants : [entry.product]) sellable.set(p.sku, p);
    }
    const items = [];
    const missing: string[] = [];
    for (const sku of wanted) {
      const p = sellable.get(sku);
      if (!p) {
        missing.push(sku);
        continue;
      }
      items.push({ sku, productId: p.id, parentProductId: p.parentProductId, price: channelPrice(p, list, b.currency) });
    }
    return { items, missing, priceListId: list?.id ?? 'default', customerGroup: customerGroup ?? null, nextCursor: null, requestId: randomUUID() };
  }

  async listPriceListsForOperator(operator: OperatorActor) {
    return (await this.store.listPriceLists?.(operator.tenantId)) ?? [];
  }

  async savePriceList(
    operator: OperatorActor,
    input: { id?: string; name: string; currency?: string; customerGroup?: string | null; archive?: boolean },
  ) {
    this.assertWrite(operator);
    if (!this.store.savePriceList) fail('NOT_FOUND', 'Price lists are not available on this store.');
    const name = input.name?.trim() ?? '';
    if (!input.archive && name.length < 2) fail('VALIDATION', 'Enter the price list name.');
    const group = input.customerGroup?.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 40) || null;
    const id = await this.store.savePriceList(operator.tenantId, {
      id: input.id,
      name: name.slice(0, 120),
      currency: (input.currency ?? 'LKR').toUpperCase().slice(0, 5),
      customerGroup: group,
      archive: input.archive,
    });
    if (input.archive) {
      // Channels that sold at this list fall back to the BookOne sell price.
      for (const connection of await this.store.listConnections(operator.tenantId)) {
        if (connection.channelSettings?.priceListId === id) {
          await this.store.updateConnection({ ...connection, channelSettings: { ...connection.channelSettings, priceListId: null }, updatedAt: nowIso() });
          await this.emitChannelPrices(operator.tenantId, connection.id);
        }
      }
    }
    await this.audit(operator, null, input.archive ? 'price_list.archive' : 'price_list.save', 'price_list', id, { name, customerGroup: group });
    return { id };
  }

  /** C2: the price list a channel sells at (null = BookOne sell price). */
  async setChannelPriceList(operator: OperatorActor, connectionId: string, priceListId: string | null) {
    this.assertWrite(operator);
    const row = await this.requireConnection(operator.tenantId, connectionId);
    if (priceListId) {
      const lists = (await this.store.listPriceLists?.(operator.tenantId)) ?? [];
      if (!lists.some((l) => l.id === priceListId)) fail('VALIDATION', 'Price list was not found.');
    }
    await this.store.updateConnection({ ...row, channelSettings: { ...row.channelSettings, priceListId }, updatedAt: nowIso() });
    await this.emitChannelPrices(operator.tenantId, connectionId);
    await this.audit(operator, connectionId, 'connection.price_list', 'connection', connectionId, { priceListId });
    return { priceListId };
  }

  /** Save prices on a list; emits `price` changes on channels selling at it. */
  async savePriceEntries(operator: OperatorActor, priceListId: string, rows: PriceEntryInput[]) {
    this.assertWrite(operator);
    if (!this.store.upsertPriceEntries) fail('NOT_FOUND', 'Price lists are not available on this store.');
    const lists = (await this.store.listPriceLists?.(operator.tenantId)) ?? [];
    if (!lists.some((l) => l.id === priceListId)) fail('VALIDATION', 'Price list was not found.');
    for (const r of rows) {
      for (const [label, v] of [['Price', r.price], ['Compare-at price', r.compareAtPrice], ['Sale price', r.salePrice]] as const) {
        if (v !== null && (!Number.isFinite(Number(v)) || Number(v) < 0)) fail('VALIDATION', `${label} must be a number of 0 or more.`);
      }
      if (r.saleStartsAt && r.saleEndsAt && Date.parse(r.saleEndsAt) <= Date.parse(r.saleStartsAt)) {
        fail('VALIDATION', 'The sale must end after it starts.');
      }
      if ((r.saleStartsAt || r.saleEndsAt) && !r.salePrice) fail('VALIDATION', 'Enter a sale price for the sale dates.');
    }
    const changed = await this.store.upsertPriceEntries(operator.tenantId, priceListId, rows);
    for (const connection of await this.store.listConnections(operator.tenantId)) {
      if (connection.channelSettings?.priceListId === priceListId) {
        await this.notifyProductsChanged(operator.tenantId, rows.map((r) => r.productId), 'price', undefined, [connection.id]);
      }
    }
    await this.audit(operator, null, 'price_list.prices', 'price_list', priceListId, { count: rows.length });
    return { changed };
  }

  /** Prices tab: sellable published SKUs with base price and the list's entry. */
  async pricesForOperator(operator: OperatorActor, connectionId: string, priceListId: string | null) {
    await this.requireConnection(operator.tenantId, connectionId);
    const b = await this.bundle(operator.tenantId, connectionId);
    const list = priceListId ? (b.priceLists ?? []).find((l) => l.id === priceListId) ?? null : null;
    const rows = [];
    for (const entry of visibleTree(b, 'published')) {
      for (const p of entry.variants.length ? entry.variants : [entry.product]) {
        const e = list?.entries.get(p.id);
        rows.push({
          productId: p.id,
          sku: p.sku,
          name: p.name,
          basePrice: Number(p.sellPrice).toFixed(2),
          price: e?.price ?? null,
          compareAtPrice: e?.compareAtPrice ?? null,
          salePrice: e?.salePrice ?? null,
          saleStartsAt: e?.saleStartsAt ?? null,
          saleEndsAt: e?.saleEndsAt ?? null,
          tiers: e?.tiers ?? [],
          effective: channelPrice(p, list, b.currency).effectivePrice,
        });
      }
    }
    return { rows, channelPriceListId: b.channel.priceListId ?? null };
  }

  /** Every published product's price changed for this channel (list switched or archived). */
  private async emitChannelPrices(tenantId: string, connectionId: string) {
    const b = await this.bundle(tenantId, connectionId);
    const ids = visibleTree(b, 'published').flatMap((e) => (e.variants.length ? e.variants : [e.product]).map((p) => p.id));
    await this.notifyProductsChanged(tenantId, ids, 'price', undefined, [connectionId]);
  }

  /** PR2: emit `price` changes when scheduled sales start or end (checked when the channel polls /changes). */
  private async tickSales(actor: CommerceActor) {
    const connection = await this.store.getConnection(actor.tenantId, actor.connectionId);
    const listId = connection?.channelSettings?.priceListId;
    if (!connection || !listId || !this.store.saleBoundaryProductIds) return;
    const now = nowIso();
    const from = connection.channelSettings?.priceTickAt ?? connection.createdAt;
    const ids = await this.store.saleBoundaryProductIds(actor.tenantId, listId, from, now);
    await this.store.updateConnection({ ...connection, channelSettings: { ...connection.channelSettings, priceTickAt: now } });
    if (ids.length) await this.notifyProductsChanged(actor.tenantId, ids, 'price', undefined, [connection.id]);
  }

  // ---------------------------------------------------------------------------
  // WP1: catalog read, channel publishing and channel settings
  // ---------------------------------------------------------------------------

  private async bundle(tenantId: string, connectionId: string): Promise<CatalogBundle> {
    if (!this.store.catalogBundle) fail('NOT_FOUND', 'The catalog is not available on this store.');
    return this.store.catalogBundle(tenantId, connectionId);
  }

  async catalogProducts(actor: CommerceActor, query: CatalogQuery) {
    this.need(actor, 'catalog');
    const b = await this.bundle(actor.tenantId, actor.connectionId);
    const page = catalogPage(b, query);
    if (query.stats) await this.attachStats(actor.tenantId, b, page.items as unknown as Array<Record<string, unknown>>);
    return { ...page, requestId: randomUUID() };
  }

  async catalogProduct(
    actor: CommerceActor,
    match: { id?: string; sku?: string },
    include: CatalogInclude[],
    mediaBase: string,
    scope: 'published' | 'all' = 'published',
    customerGroup?: string | null,
    stats = false,
  ) {
    this.need(actor, 'catalog');
    const b = await this.bundle(actor.tenantId, actor.connectionId);
    const found = findCatalogProduct(b, match, include, mediaBase, scope, customerGroup);
    if (!found) fail('NOT_FOUND', 'Product was not found on this channel.');
    if (stats) await this.attachStats(actor.tenantId, b, [found as unknown as Record<string, unknown>]);
    return { ...found, requestId: randomUUID() };
  }

  async catalogCategories(actor: CommerceActor, cursor?: string | null, limit?: number) {
    this.need(actor, 'catalog');
    const b = await this.bundle(actor.tenantId, actor.connectionId);
    return { ...pageOf(categoryList(b), cursor, limit), requestId: randomUUID() };
  }

  async catalogBrands(actor: CommerceActor, cursor?: string | null, limit?: number) {
    this.need(actor, 'catalog');
    const b = await this.bundle(actor.tenantId, actor.connectionId);
    return { ...pageOf(brandList(b), cursor, limit), requestId: randomUUID() };
  }

  async catalogAttributes(actor: CommerceActor, cursor?: string | null, limit?: number) {
    this.need(actor, 'catalog');
    const b = await this.bundle(actor.tenantId, actor.connectionId);
    return { ...pageOf(attributeList(b), cursor, limit), requestId: randomUUID() };
  }

  /** Operator view of the channel catalog for the Products tab (every product, published flag, weight). */
  async channelCatalogForOperator(operator: OperatorActor, connectionId: string) {
    await this.requireConnection(operator.tenantId, connectionId);
    const b = await this.bundle(operator.tenantId, connectionId);
    const publishedIds = new Set(visibleTree(b, 'published').flatMap((e) => [e.product.id, ...e.variants.map((v) => v.id)]));
    return {
      products: b.products
        .filter((p) => !p.archived)
        .map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          parentProductId: p.parentProductId,
          productType: p.productType,
          categoryId: p.categoryId,
          productBrandId: p.productBrandId,
          weightGrams: p.weightGrams,
          published: publishedIds.has(p.id),
          explicitlyPublished: b.published.has(p.id),
          linked: b.mapped.has(p.id),
        })),
      categories: categoryList(b).map((c) => ({ id: c.id, name: c.name })),
      brands: brandList(b).map((x) => ({ id: x.id, name: x.name })),
      missingWeight: missingWeight(b),
      channel: b.channel,
    };
  }

  /** Publish or unpublish products on a channel (WP1 C1); publishing a parent publishes its variants. */
  async setChannelPublishing(operator: OperatorActor, connectionId: string, productIds: string[], published: boolean) {
    this.assertWrite(operator);
    await this.requireConnection(operator.tenantId, connectionId);
    if (!this.store.setChannelProducts) fail('NOT_FOUND', 'Channel publishing is not available on this store.');
    if (!productIds.length) fail('VALIDATION', 'Select at least one product.');
    if (productIds.length > 1000) fail('VALIDATION', 'Publish at most 1000 products at a time.');
    const changed = await this.store.setChannelProducts(operator.tenantId, connectionId, productIds, published);
    for (const id of productIds) {
      const product = await this.store.getProduct(operator.tenantId, id);
      await this.emitCatalogEvent(operator.tenantId, connectionId, 'product', id, product?.sku ?? null, {
        action: published ? 'published' : 'unpublished',
        productId: id,
        sku: product?.sku ?? null,
      });
    }
    await this.audit(operator, connectionId, published ? 'catalog.publish' : 'catalog.unpublish', 'mapping', connectionId, {
      count: productIds.length,
      changed,
    });
    return { changed };
  }

  async updateChannelSettings(
    operator: OperatorActor,
    connectionId: string,
    input: { safetyBuffer?: number; allowBackorder?: boolean; timezone?: string },
  ) {
    this.assertWrite(operator);
    const row = await this.requireConnection(operator.tenantId, connectionId);
    const buffer = input.safetyBuffer ?? row.channelSettings?.safetyBuffer ?? 0;
    if (!Number.isFinite(buffer) || buffer < 0 || buffer > 1000) fail('VALIDATION', 'Safety buffer must be between 0 and 1000.');
    const next = {
      ...row,
      channelSettings: {
        ...row.channelSettings,
        safetyBuffer: Math.floor(buffer),
        allowBackorder: input.allowBackorder ?? Boolean(row.channelSettings?.allowBackorder),
        timezone: (input.timezone ?? row.channelSettings?.timezone ?? 'Asia/Colombo').slice(0, 60),
      },
      updatedAt: nowIso(),
    };
    await this.store.updateConnection(next);
    await this.emitStock(await this.actorForOperator(operator, connectionId));
    await this.audit(operator, connectionId, 'connection.channel', 'connection', connectionId, next.channelSettings);
    return next;
  }

  /**
   * A BookOne product, image or stock change outside commerce (product form,
   * POS sale, invoice). Emits `product` / `inventory` changes on every channel
   * that publishes or links the product.
   */
  async notifyProductsChanged(
    tenantId: string,
    productIds: string[],
    kind: 'product' | 'inventory' | 'price' | 'image',
    /** Only channels selling from this location (stock moved there). Omit for all. */
    atLocation?: string | null,
    /** Only these connections. */
    onlyConnections?: string[],
  ) {
    const ids = [...new Set(productIds)].filter(Boolean);
    if (!ids.length) return;
    const connections = await this.store.listConnections(tenantId);
    for (const connection of connections) {
      if (connection.status !== 'active') continue;
      if (atLocation !== undefined && (connection.locationId ?? null) !== (atLocation ?? null)) continue;
      if (onlyConnections && !onlyConnections.includes(connection.id)) continue;
      const priceBundle = kind === 'price' && this.store.catalogBundle ? await this.store.catalogBundle(tenantId, connection.id) : null;
      const priceList = priceBundle ? activeList(priceBundle) : null;
      const mappings = await this.store.listMappings(tenantId, connection.id);
      const channel = new Set((await this.store.listChannelProductIds?.(tenantId, connection.id)) ?? []);
      for (const id of ids) {
        const product = await this.store.getProduct(tenantId, id);
        const parentPublished = product?.parentProductId ? channel.has(product.parentProductId) : false;
        const mapping = mappings.find((m) => m.bookoneProductId === id);
        if (!mapping && !channel.has(id) && !parentPublished) continue;
        if (kind === 'inventory') {
          if (connection.outboundPaused) continue;
          const stock = await this.store.getStock(tenantId, id, connection.locationId);
          const committed = (await this.store.committedQty?.(tenantId, id, connection.locationId)) ?? 0;
          const onHand = Number(stock?.quantity ?? 0);
          const buffer = Number(connection.channelSettings?.safetyBuffer ?? 0) || 0;
          const revision = await this.store.nextRevision(tenantId, connection.id);
          await this.store.insertOutbox({
            id: randomUUID(),
            tenantId,
            connectionId: connection.id,
            revision,
            kind: 'inventory',
            productId: id,
            sku: mapping?.sku ?? product?.sku ?? null,
            payload: {
              sku: mapping?.sku ?? product?.sku ?? null,
              quantity: qtyString(Math.max(0, onHand - committed - buffer)),
              onHand: qtyString(onHand),
              committed: qtyString(committed),
              available: qtyString(Math.max(0, onHand - committed - buffer)),
              revision,
              asOf: nowIso(),
              locationId: connection.locationId,
            },
            createdAt: nowIso(),
          });
        } else if (kind === 'price') {
          const raw = priceBundle?.products.find((p) => p.id === id);
          if (!raw) continue;
          await this.emitCatalogEvent(tenantId, connection.id, 'price', id, raw.sku, {
            productId: raw.parentProductId ?? id,
            variantId: raw.parentProductId ? id : null,
            sku: raw.sku,
            price: channelPrice(raw, priceList, priceBundle!.currency),
          });
        } else if (kind === 'image') {
          // WP4: photos changed. Also a product change (its revision moved), so clients that only read `product` re-import it.
          const ref = { productId: product?.parentProductId ?? id, variantId: product?.parentProductId ? id : null, sku: product?.sku ?? null };
          await this.emitCatalogEvent(tenantId, connection.id, 'image', id, product?.sku ?? null, { action: 'updated', ...ref });
          await this.emitCatalogEvent(tenantId, connection.id, 'product', id, product?.sku ?? null, { action: 'updated', ...ref });
        } else {
          await this.emitCatalogEvent(tenantId, connection.id, 'product', id, product?.sku ?? null, {
            action: 'updated',
            productId: product?.parentProductId ?? id,
            variantId: product?.parentProductId ? id : null,
            sku: product?.sku ?? null,
          });
        }
      }
    }
  }

  /** WP4: a category or product brand changed; every active channel gets a `category` / `brand` change. */
  async notifyTaxonomyChanged(tenantId: string, kind: 'category' | 'brand', id: string, action: 'created' | 'updated' | 'deleted') {
    for (const connection of await this.store.listConnections(tenantId)) {
      if (connection.status !== 'active') continue;
      await this.emitCatalogEvent(tenantId, connection.id, kind, null, null, kind === 'category' ? { categoryId: id, action } : { brandId: id, action });
    }
  }

  // ---------------------------------------------------------------------------
  // WP0: web orders in BookOne (list, detail and staff actions)
  // ---------------------------------------------------------------------------

  /** Every order this connection received, newest first, with what staff need to act. */
  async listWebOrders(operator: OperatorActor, connectionId: string) {
    await this.requireConnection(operator.tenantId, connectionId);
    const orders = await this.store.listOrders(operator.tenantId, connectionId);
    return orders.map((order) => this.webOrderView(order));
  }

  async getWebOrder(operator: OperatorActor, connectionId: string, orderId: string) {
    const order = await this.requireWebOrder(operator, connectionId, orderId);
    return { ...this.webOrderView(order), snapshot: order.snapshot };
  }

  /** Staff confirmed the order (stock already held for COD / bank transfer). */
  async confirmWebOrder(operator: OperatorActor, connectionId: string, orderId: string) {
    this.assertWrite(operator);
    const order = await this.requireWebOrder(operator, connectionId, orderId);
    if (order.status === 'cancelled' || order.status === 'refunded') fail('CONFLICT', 'A cancelled or refunded order cannot be confirmed.');
    const f = order.fulfilment ?? { ...EMPTY_FULFILMENT, shipments: [] };
    if (f.status === 'unfulfilled') f.status = 'confirmed';
    f.confirmedAt = f.confirmedAt ?? nowIso();
    order.fulfilment = f;
    return this.saveStaffChange(operator, connectionId, order, 'confirmed');
  }

  /** Payment arrived (courier remitted COD cash, bank transfer cleared, gateway confirmed). */
  async markWebOrderPaid(operator: OperatorActor, connectionId: string, orderId: string) {
    this.assertWrite(operator);
    const order = await this.requireWebOrder(operator, connectionId, orderId);
    if (order.snapshot.payment?.status === 'paid') fail('CONFLICT', 'This order is already marked paid.');
    if (order.status === 'cancelled' || order.status === 'refunded') fail('CONFLICT', 'A cancelled or refunded order cannot be marked paid.');
    const actor = await this.actorForOperator(operator, connectionId);
    await this.applyEvent(actor, order.externalId, {
      externalEventId: `staff-paid:${order.id}`,
      kind: 'paid',
      effectiveAt: nowIso(),
    });
    await this.audit(operator, connectionId, 'order.paid', 'order', order.id, { externalId: order.externalId });
    return this.webOrderView((await this.store.getOrderByExternalId(operator.tenantId, connectionId, order.externalId)) ?? order);
  }

  async dispatchWebOrder(
    operator: OperatorActor,
    connectionId: string,
    orderId: string,
    input: { carrier: string; trackingNumber: string; trackingUrlTemplate?: string | null },
  ) {
    this.assertWrite(operator);
    const carrier = input.carrier?.trim();
    const tracking = input.trackingNumber?.trim();
    if (!carrier) fail('VALIDATION', 'Choose or enter the courier.');
    if (!tracking) fail('VALIDATION', 'Enter the tracking number.');
    const order = await this.requireWebOrder(operator, connectionId, orderId);
    if (order.status === 'cancelled' || order.status === 'refunded') fail('CONFLICT', 'A cancelled or refunded order cannot be dispatched.');
    const f = order.fulfilment ?? { ...EMPTY_FULFILMENT, shipments: [] };
    const shippedAt = nowIso();
    f.shipments = [
      ...f.shipments,
      {
        id: randomUUID(),
        carrier,
        trackingNumber: tracking,
        trackingUrl: trackingUrlFor(input.trackingUrlTemplate, tracking),
        shippedAt,
        deliveredAt: null,
      },
    ];
    f.status = 'shipped';
    f.confirmedAt = f.confirmedAt ?? shippedAt;
    order.fulfilment = f;
    return this.saveStaffChange(operator, connectionId, order, 'dispatched');
  }

  async markWebOrderDelivered(operator: OperatorActor, connectionId: string, orderId: string) {
    this.assertWrite(operator);
    const order = await this.requireWebOrder(operator, connectionId, orderId);
    const f = order.fulfilment ?? { ...EMPTY_FULFILMENT, shipments: [] };
    if (f.status !== 'shipped' && f.status !== 'out_for_delivery') fail('CONFLICT', 'Dispatch the order before marking it delivered.');
    const at = nowIso();
    f.status = 'delivered';
    f.shipments = f.shipments.map((s) => (s.deliveredAt ? s : { ...s, deliveredAt: at }));
    order.fulfilment = f;
    if (order.status === 'posted' || order.status === 'paid') order.status = 'fulfilled';
    return this.saveStaffChange(operator, connectionId, order, 'delivered');
  }

  /** Cancel from BookOne: releases held stock; a posted order gets a linked return with restock. */
  async cancelWebOrder(operator: OperatorActor, connectionId: string, orderId: string) {
    this.assertWrite(operator);
    const order = await this.requireWebOrder(operator, connectionId, orderId);
    if (order.status === 'cancelled') fail('CONFLICT', 'This order is already cancelled.');
    const actor = await this.actorForOperator(operator, connectionId);
    const receipt = await this.applyEvent(actor, order.externalId, {
      externalEventId: `staff-cancel:${order.id}`,
      kind: 'cancelled',
      effectiveAt: nowIso(),
    });
    await this.audit(operator, connectionId, 'order.cancel', 'order', order.id, { externalId: order.externalId });
    return receipt;
  }

  /** Full refund from BookOne, with or without putting the goods back into stock. */
  async refundWebOrder(operator: OperatorActor, connectionId: string, orderId: string, input: { restock: boolean }) {
    this.assertWrite(operator);
    const order = await this.requireWebOrder(operator, connectionId, orderId);
    if (!order.documentId) fail('CONFLICT', 'Only a posted order can be refunded. Cancel an unposted order instead.');
    const refunded = order.lines.reduce((sum, line) => sum + Number(line.refundedAmount), 0);
    const remaining = Number(order.total) - refunded;
    if (remaining <= 0.005) fail('CONFLICT', 'This order is already fully refunded.');
    const actor = await this.actorForOperator(operator, connectionId);
    const stamp = randomUUID();
    const receipt = await this.applyEvent(actor, order.externalId, {
      externalEventId: `staff-refund:${stamp}`,
      externalRefundId: `staff-refund:${stamp}`,
      kind: 'refunded',
      effectiveAt: nowIso(),
      amount: moneyString(remaining),
      restock: input.restock,
      ...(input.restock
        ? {
            lines: order.lines
              .filter((line) => Number(line.quantity) - Number(line.restockedQty) > 0)
              .map((line) => ({
                externalLineId: line.externalLineId,
                quantity: String(Number(line.quantity) - Number(line.restockedQty)),
              })),
          }
        : {}),
    });
    await this.audit(operator, connectionId, 'order.refund', 'order', order.id, { externalId: order.externalId, restock: input.restock });
    return receipt;
  }

  /** Payment methods this channel has used, with where each settles and whether it holds stock (WP0.3 / WP6). */
  async paymentMethods(actor: CommerceActor) {
    this.need(actor, 'order');
    const connection = await this.requireConnection(actor.tenantId, actor.connectionId);
    const settings = normalizePaymentSettings(connection.paymentSettings);
    const commit = connection.paymentSettings?.commitStockMethods ?? DEFAULT_COMMIT_STOCK_METHODS;
    const names = [...new Set([...settings.seenMethods, ...Object.keys(settings.methods), ...commit])].sort();
    return {
      items: names.map((method) => {
        const mapped = settings.methods[method];
        return {
          method,
          settlementAccountCode: mapped && mapped !== UNPAID_METHOD ? mapped : mapped === UNPAID_METHOD ? null : settings.defaultAccountCode,
          settlesOnPaid: mapped === UNPAID_METHOD ? false : Boolean(mapped || settings.defaultAccountCode),
          holdsStockWhilePending: commit.includes(method),
        };
      }),
      defaultSettlementAccountCode: settings.defaultAccountCode,
      acceptsAnyMethodName: true,
      nextCursor: null,
    };
  }

  private webOrderView(order: OrderRow) {
    const snap = order.snapshot;
    const f = order.fulfilment ?? EMPTY_FULFILMENT;
    return {
      id: order.id,
      externalId: order.externalId,
      displayNumber: (snap as { displayNumber?: string }).displayNumber ?? order.externalId,
      placedAt: order.placedAt,
      customerName: snap.customer?.name ?? '',
      customerPhone: (snap.customer as { phone?: string } | undefined)?.phone ?? null,
      customerEmail: snap.customer?.email ?? null,
      // WP5: what staff need to pack and ship.
      shippingAddress: addressText(snap.shippingAddress) || null,
      billingAddress: addressText(snap.billingAddress) || null,
      delivery: snap.delivery ?? null,
      discounts: snap.discounts ?? [],
      fees: snap.fees ?? [],
      customerNote: snap.customerNote ?? null,
      attachments: snap.attachments ?? [],
      paymentRef: snap.payment?.externalRef ?? null,
      gatewayFee: snap.payment?.gatewayFee ?? null,
      total: order.total,
      currency: order.currency,
      paymentMethod: snap.payment?.method ?? null,
      paymentStatus: snap.payment?.status ?? 'pending',
      status: order.status,
      reviewReason: order.reviewReason,
      fulfilment: f,
      stock: f.stock ?? 'none',
      documentNumber: order.documentNumber,
      settlementAccountCode: order.settlementAccountCode ?? null,
      lineCount: order.lines.length,
      lines: order.lines.map((line) => ({
        sku: line.sku,
        description: snap.lines?.find((l) => l.externalLineId === line.externalLineId)?.description ?? null,
        discountAmount: line.discountAmount,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        restockedQty: line.restockedQty,
        refundedAmount: line.refundedAmount,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private async requireWebOrder(operator: OperatorActor, connectionId: string, orderId: string) {
    await this.requireConnection(operator.tenantId, connectionId);
    const order = this.store.getOrderById
      ? await this.store.getOrderById(operator.tenantId, orderId)
      : (await this.store.listOrders(operator.tenantId, connectionId)).find((o) => o.id === orderId) ?? null;
    if (!order || order.connectionId !== connectionId) fail('NOT_FOUND', 'Web order was not found.');
    return order;
  }

  private async saveStaffChange(operator: OperatorActor, connectionId: string, order: OrderRow, action: string) {
    order.updatedAt = nowIso();
    await this.store.updateOrder(order);
    await this.emitOrder(operator.tenantId, connectionId, order, action);
    await this.audit(operator, connectionId, `order.${action}`, 'order', order.id, { externalId: order.externalId });
    return this.webOrderView(order);
  }

  private async actorForOperator(operator: OperatorActor, connectionId: string): Promise<CommerceActor> {
    const connection = await this.requireConnection(operator.tenantId, connectionId);
    return {
      tenantId: operator.tenantId,
      connectionId: connection.id,
      credentialId: 'operator',
      userId: connection.createdByUserId,
      locationId: connection.locationId,
      currency: connection.currency,
      environment: connection.environment,
      kind: connection.kind,
      scopes: ['catalog', 'inventory', 'order', 'lifecycle'],
      postingMode: connection.postingMode,
      inboundPaused: false,
      outboundPaused: connection.outboundPaused,
      oversellPolicy: connection.oversellPolicy,
      reservationMode: connection.reservationMode,
      prefix: 'operator',
    };
  }

  /** On hand minus stock held for open web orders. */
  private async availableQty(tenantId: string, productId: string, locationId: string | null): Promise<number> {
    const stock = await this.store.getStock(tenantId, productId, locationId);
    const committed = (await this.store.committedQty?.(tenantId, productId, locationId)) ?? 0;
    return Number(stock?.quantity ?? 0) - committed;
  }

  /**
   * WP0: COD / bank-transfer orders hold stock on receipt while payment is
   * pending, so the unit cannot sell again online or at the POS.
   */
  private async commitOnReceipt(
    actor: CommerceActor,
    order: OrderRow,
    preview: { ok: boolean; mapped: Array<{ sku: string; productId: string | null; quantity: number }> },
  ) {
    if (!this.store.commitStock || !preview.ok) return;
    if (order.fulfilment?.stock === 'committed') return; // already held by a converted reservation
    if (order.status !== 'received' || order.snapshot.payment?.status !== 'pending') return;
    const connection = await this.store.getConnection(actor.tenantId, actor.connectionId);
    const methods = connection?.paymentSettings?.commitStockMethods ?? DEFAULT_COMMIT_STOCK_METHODS;
    const method = paymentMethodKey(order.snapshot.payment?.method);
    if (!method || !methods.includes(method)) return;
    const lines = preview.mapped
      .filter((m): m is { sku: string; productId: string; quantity: number } => Boolean(m.productId))
      .map((m) => ({ productId: m.productId, quantity: m.quantity }));
    if (!lines.length) return;
    const held = await this.store.commitStock({
      tenantId: actor.tenantId,
      connectionId: actor.connectionId,
      orderId: order.id,
      locationId: actor.locationId,
      lines,
    });
    if (held.ok) {
      order.fulfilment = { ...(order.fulfilment ?? EMPTY_FULFILMENT), stock: 'committed' };
      order.reviewReason = 'Payment is pending. Stock is held for this order.';
    } else {
      const skuOf = (id: string) => preview.mapped.find((m) => m.productId === id)?.sku ?? id;
      holdForReview(
        order,
        `Not enough stock to hold this order: ${held.short
          .map((x) => `SKU ${skuOf(x.productId)} needs ${x.needed}, available ${x.available}`)
          .join('; ')}.`,
      );
    }
    order.updatedAt = nowIso();
    await this.store.updateOrder(order);
    await this.emitOrder(actor.tenantId, actor.connectionId, order, held.ok ? 'stock_held' : 'needs_review');
    if (held.ok) await this.emitStock(actor, lines.map((l) => l.productId));
  }

  private async releaseHold(actor: CommerceActor, order: OrderRow) {
    const released = (await this.store.settleCommitments?.(actor.tenantId, order.id, 'released')) ?? 0;
    if (!released) return;
    order.fulfilment = { ...(order.fulfilment ?? EMPTY_FULFILMENT), stock: 'released' };
    await this.emitStock(
      actor,
      order.lines.map((l) => l.bookoneProductId).filter((id): id is string => Boolean(id)),
    );
  }

  /** BookOne-side order change for the feed (`kind: "order"`), so websites can email customers. */
  private async emitOrder(tenantId: string, connectionId: string, order: OrderRow, action: string) {
    const revision = await this.store.nextRevision(tenantId, connectionId);
    await this.store.insertOutbox({
      id: randomUUID(),
      tenantId,
      connectionId,
      revision,
      kind: 'order',
      productId: null,
      sku: null,
      payload: {
        externalId: order.externalId,
        action,
        status: order.status,
        paymentStatus: order.snapshot.payment?.status ?? null,
        fulfilment: order.fulfilment ?? EMPTY_FULFILMENT,
        documentNumber: order.documentNumber,
        revision,
      },
      createdAt: nowIso(),
    });
  }

  private async emitCatalogEvent(
    tenantId: string,
    connectionId: string,
    kind: 'mapping' | 'publish' | 'product' | 'price' | 'reservation' | 'customer' | 'image' | 'category' | 'brand',
    productId: string | null,
    sku: string | null,
    payload: Record<string, unknown>,
  ) {
    const revision = await this.store.nextRevision(tenantId, connectionId);
    await this.store.insertOutbox({
      id: randomUUID(),
      tenantId,
      connectionId,
      revision,
      kind,
      productId,
      sku,
      payload: { ...payload, revision },
      createdAt: nowIso(),
    });
  }

  private async emitStock(actor: CommerceActor, productIds?: string[]) {
    let ids = productIds?.length ? productIds : null;
    if (!ids) {
      const mapped = (await this.store.listMappings(actor.tenantId, actor.connectionId)).map((m) => m.bookoneProductId);
      const published = (await this.store.listChannelProductIds?.(actor.tenantId, actor.connectionId)) ?? [];
      ids = [...mapped, ...published];
    }
    await this.notifyProductsChanged(actor.tenantId, ids, 'inventory', actor.locationId);
  }

  private async finishEligiblePost(actor: CommerceActor, order: OrderRow) {
    if (order.documentId) return;
    if (actor.postingMode !== 'posting') return;
    const input = order.snapshot;
    if (input.payment?.status !== 'paid') return;
    const unrepresentable = this.posting.handlesStoreTax ? null : representabilityIssue(input);
    if (unrepresentable) {
      order.status = 'needs_review';
      order.reviewReason = unrepresentable;
      await this.store.updateOrder(order);
      return;
    }
    const preview = await this.validateOrder(actor, input);
    if (!preview.ok) {
      order.status = 'needs_review';
      order.reviewReason = preview.issues.filter((i) => i.blocking).map((i) => i.message).join(' ');
      await this.store.updateOrder(order);
      return;
    }
    const stockIssues: string[] = [];
    for (const line of preview.mapped) {
      if (!line.productId) continue;
      const stock = await this.store.getStock(actor.tenantId, line.productId, actor.locationId);
      if (Number(stock?.quantity ?? '0') < line.quantity) stockIssues.push(line.sku);
    }
    if (stockIssues.length) {
      order.status = 'needs_review';
      order.reviewReason = `Paid order cannot be accepted: stock unavailable for ${stockIssues.join(', ')}.`;
      await this.store.updateOrder(order);
      return;
    }
    await this.tryPostInvoice(actor, order, preview);
  }

  private async tryPostInvoice(
    actor: CommerceActor,
    order: OrderRow,
    preview: { mapped: Array<{ sku: string; productId: string | null; quantity: number; unitPrice: number }> },
  ) {
    // Held stock becomes the invoice's stock movement; restore the hold if posting fails.
    const consumed = (await this.store.settleCommitments?.(actor.tenantId, order.id, 'consumed')) ?? 0;
    try {
      const input = order.snapshot;
      const connection = await this.store.getConnection(actor.tenantId, actor.connectionId);
      const payment = resolvePaymentAccount(connection?.paymentSettings, input);
      const posted = await this.posting.postSalesInvoice({
        actor,
        order: input,
        lines: preview.mapped
          .filter((m) => m.productId)
          .map((m) => {
            const line = input.lines.find((row) => row.sku === m.sku);
            return {
              productId: m.productId as string,
              sku: m.sku,
              description: line?.description || m.sku,
              quantity: m.quantity,
              unitPrice: m.unitPrice,
              discountAmount: Number(line?.discountAmount ?? 0),
            };
          }),
        headerDiscount: Number(input.discountAmount ?? 0),
        freightAmount: Number(input.shippingAmount ?? 0),
        invoiceKind: 'commercial',
        paymentAccountCode: payment.accountCode ?? undefined,
        idempotencyKey: `commerce:${actor.connectionId}:${input.externalId}`,
        locationId: actor.locationId,
        issueDate: input.placedAt.slice(0, 10),
      });
      order.documentId = posted.documentId;
      order.documentNumber = posted.documentNumber;
      order.settlementAccountCode = payment.accountCode;
      if (consumed && order.fulfilment) order.fulfilment.stock = 'consumed';
      order.status = 'posted';
      order.reviewReason = null;
      order.updatedAt = nowIso();
      await this.store.updateOrder(order);
      await this.emitOrder(actor.tenantId, actor.connectionId, order, 'posted');
      if (payment.source === 'not_configured') {
        // Paid, but no account chosen for this method: say so in Activity.
        await this.store.insertActivity({
          id: randomUUID(),
          tenantId: actor.tenantId,
          connectionId: actor.connectionId,
          actorUserId: actor.userId,
          action: 'order.unsettled',
          entity: 'order',
          entityId: order.id,
          detail: {
            externalId: order.externalId,
            documentNumber: order.documentNumber,
            method: payment.method || null,
            reason: `Paid order left open in receivables: no payment account is set for ${payment.method ? `method "${payment.method}"` : 'orders without a method'}. Set one under Payments.`,
          },
          createdAt: nowIso(),
        });
      }
      await this.emitStock(
        actor,
        preview.mapped.map((line) => line.productId).filter((id): id is string => Boolean(id)),
      );
    } catch (error) {
      if (consumed) await this.store.settleCommitments?.(actor.tenantId, order.id, 'active');
      order.status = 'needs_review';
      order.reviewReason = error instanceof Error ? error.message : 'BookOne posting failed. No duplicate journals were created.';
      order.updatedAt = nowIso();
      await this.store.updateOrder(order);
    }
  }

  private orderReceipt(order: OrderRow, processing: string) {
    return {
      ok: true as const,
      requestId: randomUUID(),
      processing,
      status: order.status,
      externalId: order.externalId,
      reviewReason: order.reviewReason,
      documentId: order.documentId,
      documentNumber: order.documentNumber,
      lastAppliedVersion: order.lastAppliedVersion,
      paymentStatus: order.snapshot.payment?.status ?? null,
      // WP0: held stock (COD / bank transfer) and BookOne-side fulfilment.
      stock: order.fulfilment?.stock ?? 'none',
      fulfilment: order.fulfilment ?? EMPTY_FULFILMENT,
      settlement: order.documentId
        ? (order.settlementAccountCode ?? paymentAccountCode(order.snapshot))
          ? 'settled'
          : 'not_configured'
        : 'none',
      httpStatusIsNotAccountingAcceptance: true,
    };
  }

  private need(actor: CommerceActor, scope: CommerceScope) {
    if (!actor.scopes.includes(scope)) fail('FORBIDDEN', `This key is missing the ${scope} scope.`);
  }

  private assertWrite(operator: OperatorActor) {
    if (!operator.canWrite) fail('FORBIDDEN', 'You do not have permission to change commerce integrations.');
  }

  private async requireConnection(tenantId: string, id: string) {
    const row = await this.store.getConnection(tenantId, id);
    if (!row) fail('NOT_FOUND', 'Connection was not found.');
    return row;
  }

  private async audit(
    operator: OperatorActor,
    connectionId: string | null,
    action: string,
    entity: string,
    entityId: string | null,
    detail: Record<string, unknown>,
  ) {
    await this.store.insertActivity({
      id: randomUUID(),
      tenantId: operator.tenantId,
      connectionId,
      actorUserId: operator.userId,
      action,
      entity,
      entityId,
      detail,
      createdAt: nowIso(),
    });
  }
}

/** A return BookOne refused while applying a store event (QA-1126-18). */
export class EventPostingError extends Error {}

/** Hold for review without losing an earlier reason (QA-1126-21). */
export function holdForReview(order: { status: string; reviewReason: string | null }, reason: string) {
  const prior = order.status === 'needs_review' ? order.reviewReason?.trim() : '';
  order.status = 'needs_review';
  order.reviewReason = prior && !prior.includes(reason) ? `${prior} | ${reason}` : reason;
}

function qtyString(n: number): string {
  const v = Math.round(n * 10000) / 10000;
  return String(Object.is(v, -0) ? 0 : v);
}

function almostEqualRefund(a: number, b: number) {
  return Math.abs(a - b) <= 0.01;
}

function representabilityIssue(input: OrderInput): string | null {
  const tax =
    Number(input.taxAmount ?? 0) + (input.lines ?? []).reduce((sum, line) => sum + Number(line.taxAmount ?? 0), 0);
  if (tax > 0.005) {
    return 'Store tax amounts cannot be represented as BookOne VAT on this path. The order is held for review.';
  }
  return null;
}

function paymentAccountCode(input: OrderInput): string | undefined {
  const method = input.payment?.method?.trim() ?? '';
  if (/^\d{4}$/.test(method)) return method;
  return undefined;
}

function isStaleVersion(previous: string | null, incoming: string | undefined): boolean {
  if (!previous || !incoming) return false;
  const a = Number(previous);
  const b = Number(incoming);
  if (Number.isFinite(a) && Number.isFinite(b) && previous.trim() !== '' && incoming.trim() !== '') return b < a;
  return incoming < previous;
}

function sanitizeActivityDetail(detail: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!detail) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    const lower = key.toLowerCase();
    if (lower.includes('token') || lower.includes('secret') || lower.includes('email') || lower.includes('phone')) continue;
    out[key] = value;
  }
  return out;
}

function classifyObservation(
  obs: MappingObservation,
  products: Array<{ id: string; sku: string; name: string; archived: boolean; isActive: boolean }>,
  existing: Array<{ bookoneProductId: string; sku: string; externalProductId: string; externalVariantId: string }>,
): MappingPreviewRow {
  const sku = (obs.sku ?? '').trim();
  const externalProductId = (obs.externalProductId ?? '').trim();
  const externalVariantId = (obs.externalVariantId ?? '').trim();
  const origin = obs.origin === 'verified_store' ? 'verified_store' : 'agent';
  if (!externalProductId) {
    return {
      sku,
      bookoneProductId: null,
      bookoneName: null,
      externalProductId,
      externalVariantId,
      kind: 'missing',
      reason: 'Store product ID is required. SKU is only a search aid.',
      origin,
      before: null,
    };
  }
  const byExternal = existing.find(
    (m) => m.externalProductId === externalProductId && (m.externalVariantId || '') === externalVariantId,
  );
  const skuMatches = sku ? products.filter((p) => p.sku.toLowerCase() === sku.toLowerCase()) : [];
  if (byExternal) {
    const linked = products.find((p) => p.id === byExternal.bookoneProductId);
    if (sku && skuMatches.length === 1 && skuMatches[0]!.id !== byExternal.bookoneProductId) {
      return {
        sku,
        bookoneProductId: skuMatches[0]!.id,
        bookoneName: skuMatches[0]!.name,
        externalProductId,
        externalVariantId,
        kind: 'conflicting',
        reason: `Store IDs already link to ${linked?.sku ?? byExternal.sku}. Ask before replacing that link.`,
        origin,
        before: {
          bookoneProductId: byExternal.bookoneProductId,
          externalProductId: byExternal.externalProductId,
          externalVariantId: byExternal.externalVariantId,
        },
      };
    }
    return {
      sku: linked?.sku ?? byExternal.sku,
      bookoneProductId: byExternal.bookoneProductId,
      bookoneName: linked?.name ?? null,
      externalProductId,
      externalVariantId,
      kind: 'unchanged',
      reason: 'Already linked. Website merchandising is unchanged.',
      origin,
      before: {
        bookoneProductId: byExternal.bookoneProductId,
        externalProductId: byExternal.externalProductId,
        externalVariantId: byExternal.externalVariantId,
      },
    };
  }
  if (!sku) {
    return {
      sku,
      bookoneProductId: null,
      bookoneName: null,
      externalProductId,
      externalVariantId,
      kind: 'missing',
      reason: 'No SKU was supplied and these store IDs are not already linked. Ask for a BookOne product.',
      origin,
      before: null,
    };
  }
  if (skuMatches.length > 1) {
    return {
      sku,
      bookoneProductId: null,
      bookoneName: null,
      externalProductId,
      externalVariantId,
      kind: 'ambiguous',
      reason: `SKU ${sku} matches more than one BookOne product. Ask which product to link.`,
      origin,
      before: null,
    };
  }
  if (skuMatches.length === 0) {
    return {
      sku,
      bookoneProductId: null,
      bookoneName: obs.name ?? null,
      externalProductId,
      externalVariantId,
      kind: 'missing',
      reason: `No BookOne product uses SKU ${sku}.`,
      origin,
      before: null,
    };
  }
  const product = skuMatches[0]!;
  if (product.archived || !product.isActive) {
    return {
      sku: product.sku,
      bookoneProductId: product.id,
      bookoneName: product.name,
      externalProductId,
      externalVariantId,
      kind: 'unsupported',
      reason: 'That BookOne product is archived or inactive.',
      origin,
      before: null,
    };
  }
  const other = existing.find((m) => m.bookoneProductId === product.id);
  if (other) {
    return {
      sku: product.sku,
      bookoneProductId: product.id,
      bookoneName: product.name,
      externalProductId,
      externalVariantId,
      kind: 'conflicting',
      reason: `${product.sku} is already linked to store product ${other.externalProductId}.`,
      origin,
      before: {
        bookoneProductId: other.bookoneProductId,
        externalProductId: other.externalProductId,
        externalVariantId: other.externalVariantId,
      },
    };
  }
  return {
    sku: product.sku,
    bookoneProductId: product.id,
    bookoneName: product.name,
    externalProductId,
    externalVariantId,
    kind: 'suggested',
    reason:
      origin === 'verified_store'
        ? `SKU ${product.sku} matches ${product.name}. Confirm in BookOne before applying.`
        : `Agent-supplied SKU ${product.sku} matches ${product.name}. This is not verified store data.`,
    origin,
    before: null,
  };
}

export function parseScopeQuery(raw: string | null): CommerceScope[] {
  return parseScopes(raw ?? '');
}

export function publicOpenApiPath() {
  return '/api/commerce/v1/openapi.json';
}
