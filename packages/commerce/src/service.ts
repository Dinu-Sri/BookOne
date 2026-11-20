import { randomUUID } from 'node:crypto';
import { CommerceError } from './errors';
import { defaultScopes, hashSecret, hashesEqual, issueToken, parseScopes, parseToken, redactedCredential } from './credentials';
import { moneyString, parseMoney, stableHash } from './money';
import type { CommerceStore } from './store';
import type {
  CommerceActor,
  CommerceScope,
  ConnectionKind,
  ConnectionRow,
  CredentialRow,
  MappingInput,
  OperatorActor,
  OrderEventInput,
  OrderInput,
  OrderRow,
  OrderStatus,
  PostingPort,
  CommerceEnvironment,
} from './types';
import { fail, validateEvent, validateOrderInput } from './validate';

const PAGE_SIZE = 100;
const CURSOR_WINDOW_REVISIONS = 10_000;

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
    return issued;
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
      const activity = await this.store.listActivity(operator.tenantId, connection.id);
      const review = await this.store.listOrders(operator.tenantId, connection.id, 'needs_review');
      out.push({
        connection,
        credentials,
        mappingCount: mappings.length,
        reviewCount: review.length,
        activity: activity.slice(0, 50),
      });
    }
    return out;
  }

  async authenticate(authorization: string | null): Promise<CommerceActor> {
    const raw = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization?.trim();
    if (!raw) fail('UNAUTHENTICATED', 'A commerce bearer token is required.');
    const parsed = parseToken(raw);
    if (!parsed) fail('UNAUTHENTICATED', 'The commerce token is not valid.');
    const credential = await this.store.getCredentialByPrefix(parsed.prefix);
    if (!credential) fail('UNAUTHENTICATED', 'The commerce token is not valid.');
    if (!hashesEqual(credential.secretHash, hashSecret(parsed.secret, this.pepper))) {
      fail('UNAUTHENTICATED', 'The commerce token is not valid.');
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
      postingMode: row.postingMode,
      inboundPaused: row.inboundPaused,
      outboundPaused: row.outboundPaused,
      oversellPolicy: row.oversellPolicy,
      reservationMode: row.reservationMode,
      capabilities: {
        catalog: true,
        inventory: true,
        orders: true,
        lifecycle: true,
        reservations: false,
        priceExport: false,
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
    const mappings = await this.store.listMappings(actor.tenantId, actor.connectionId);
    const wanted = skus && skus.length ? new Set(skus) : null;
    if (wanted && wanted.size > 100) fail('VALIDATION', 'Inventory lookup batches are limited to 100 SKUs.');
    const items = [];
    for (const mapping of mappings) {
      if (wanted && !wanted.has(mapping.sku) && !wanted.has(mapping.externalProductId)) continue;
      const stock = await this.store.getStock(actor.tenantId, mapping.bookoneProductId, actor.locationId);
      items.push({
        sku: mapping.sku,
        productId: mapping.bookoneProductId,
        locationId: actor.locationId,
        quantity: stock?.quantity ?? '0',
        revision: stock?.revision ?? 0,
        asOf: stock?.asOf ?? nowIso(),
        stale: stock?.stale ?? false,
      });
    }
    return { items, authority: 'bookone', mode: 'absolute' };
  }

  async changes(actor: CommerceActor, cursor?: string) {
    this.need(actor, 'catalog');
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
    const items = await this.store.listOutbox(actor.tenantId, actor.connectionId, after, PAGE_SIZE);
    const last = items[items.length - 1]?.revision ?? after;
    return { items, nextCursor: encodeCursor(last), fullResync: false };
  }

  async previewMappings(operator: OperatorActor, connectionId: string, proposed: MappingInput[]) {
    this.assertWrite(operator);
    const preview = [];
    for (const row of proposed) {
      const product = await this.store.getProduct(operator.tenantId, row.bookoneProductId);
      preview.push({
        sku: row.sku,
        bookoneProductId: row.bookoneProductId,
        bookoneName: product?.name ?? null,
        externalProductId: row.externalProductId,
        externalVariantId: row.externalVariantId ?? '',
        issue: product ? null : 'BookOne product was not found.',
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
    }
    connection.lastCatalogSyncAt = nowIso();
    await this.store.updateConnection(connection);
    await this.audit(operator, connectionId, 'mapping.apply', 'mapping', connectionId, { count: proposed.length });
    return { applied: proposed.length };
  }

  async publishStock(operator: OperatorActor, connectionId: string) {
    this.assertWrite(operator);
    const connection = await this.requireConnection(operator.tenantId, connectionId);
    if (connection.outboundPaused) fail('OUTBOUND_PAUSED', 'Outbound stock publishing is paused.');
    const mappings = await this.store.listMappings(operator.tenantId, connectionId);
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
        },
        createdAt: nowIso(),
      });
      count += 1;
    }
    connection.lastStockSyncAt = nowIso();
    await this.store.updateConnection(connection);
    await this.audit(operator, connectionId, 'stock.publish', 'inventory', connectionId, { count });
    return { published: count };
  }

  async validateOrder(actor: CommerceActor, input: OrderInput) {
    this.need(actor, 'order');
    const mappings = await this.store.listMappings(actor.tenantId, actor.connectionId);
    const products = await this.store.listSellableProducts(actor.tenantId);
    return validateOrderInput(input, { currency: actor.currency, mappings, products });
  }

  async submitOrder(actor: CommerceActor, input: OrderInput, idempotencyKey: string | null) {
    this.need(actor, 'order');
    if (actor.inboundPaused) fail('INBOUND_PAUSED', 'Inbound orders are paused for this connection.');
    if (!idempotencyKey?.trim()) fail('VALIDATION', 'Idempotency-Key is required.');
    if (!input.externalId?.trim()) fail('VALIDATION', 'Store order ID is required and is immutable.');
    const payloadHash = stableHash(input);
    const existingKey = await this.store.getIdempotency(actor.tenantId, actor.connectionId, idempotencyKey);
    if (existingKey) {
      if (existingKey.payloadHash !== payloadHash) {
        fail('CONFLICT', 'This Idempotency-Key was already used with a different payload.');
      }
      return { ...existingKey.receipt, replayed: true };
    }
    const existingOrder = await this.store.getOrderByExternalId(actor.tenantId, actor.connectionId, input.externalId);
    if (existingOrder) {
      if (existingOrder.payloadHash !== payloadHash) {
        fail('CONFLICT', 'This store order ID already exists with a different payload.');
      }
      const receipt = this.orderReceipt(existingOrder, 'accepted_for_processing');
      await this.store.putIdempotency(actor.tenantId, actor.connectionId, idempotencyKey, {
        payloadHash,
        orderId: existingOrder.id,
        receipt,
      });
      return { ...receipt, replayed: true };
    }

    const preview = await this.validateOrder(actor, input);
    const orderId = randomUUID();
    let status: OrderStatus = 'received';
    let reviewReason: string | null = null;
    if (!preview.ok) {
      status = 'needs_review';
      reviewReason = preview.issues.filter((i) => i.blocking).map((i) => i.message).join(' ');
    } else if (input.payment?.status === 'failed' || input.payment?.status === 'pending') {
      status = 'received';
      reviewReason = input.payment.status === 'failed' ? 'Payment failed. No inventory or journals were posted.' : 'Payment is pending. Inventory is not committed.';
    } else if (actor.postingMode !== 'posting') {
      status = 'needs_review';
      reviewReason = 'Connection posting is in preview. Enable posting after mappings are checked.';
    }

    const stockIssues: string[] = [];
    if (status === 'received' && actor.postingMode === 'posting' && preview.ok && input.payment?.status === 'paid') {
      for (const line of preview.mapped) {
        if (!line.productId) continue;
        const stock = await this.store.getStock(actor.tenantId, line.productId, actor.locationId);
        const available = Number(stock?.quantity ?? '0');
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
      id: orderId,
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

    if (status === 'received' && actor.postingMode === 'posting' && preview.ok && input.payment?.status === 'paid' && !stockIssues.length) {
      try {
        const posted = await this.posting.postSalesInvoice({
          actor,
          order: input,
          lines: preview.mapped
            .filter((m) => m.productId)
            .map((m) => ({
              productId: m.productId as string,
              sku: m.sku,
              description: input.lines.find((l) => l.sku === m.sku)?.description || m.sku,
              quantity: m.quantity,
              unitPrice: m.unitPrice,
            })),
          idempotencyKey: `commerce:${actor.connectionId}:${input.externalId}`,
          locationId: actor.locationId,
          issueDate: input.placedAt.slice(0, 10),
        });
        order.documentId = posted.documentId;
        order.documentNumber = posted.documentNumber;
        order.status = 'posted';
        order.reviewReason = null;
        await this.emitStock(actor);
      } catch (error) {
        order.status = 'needs_review';
        order.reviewReason = error instanceof Error ? error.message : 'BookOne posting failed. No duplicate journals were created.';
      }
    }

    await this.store.insertOrder(order);
    const receipt = this.orderReceipt(order, 'accepted_for_processing');
    await this.store.putIdempotency(actor.tenantId, actor.connectionId, idempotencyKey, {
      payloadHash,
      orderId: order.id,
      receipt,
    });
    const connection = await this.requireConnection(actor.tenantId, actor.connectionId);
    connection.lastOrderSyncAt = nowIso();
    await this.store.updateConnection(connection);
    return receipt;
  }

  async getOrder(actor: CommerceActor, externalId: string) {
    this.need(actor, 'order');
    const order = await this.store.getOrderByExternalId(actor.tenantId, actor.connectionId, externalId);
    if (!order) fail('NOT_FOUND', 'Order was not found.');
    return this.orderReceipt(order, order.status);
  }

  async applyEvent(actor: CommerceActor, externalId: string, input: OrderEventInput) {
    this.need(actor, 'lifecycle');
    if (actor.inboundPaused) fail('INBOUND_PAUSED', 'Inbound order events are paused for this connection.');
    const issues = validateEvent(input);
    if (issues.length) fail('VALIDATION', issues[0]!.message, { issues });
    const order = await this.store.getOrderByExternalId(actor.tenantId, actor.connectionId, externalId);
    if (!order) fail('NOT_FOUND', 'Order was not found.');
    const inserted = await this.store.insertEvent({
      id: randomUUID(),
      tenantId: actor.tenantId,
      connectionId: actor.connectionId,
      orderId: order.id,
      externalEventId: input.externalEventId,
      kind: input.kind,
      status: 'applied',
      sourceVersion: input.sourceVersion ?? null,
      effectiveAt: input.effectiveAt,
      amount: input.amount ?? null,
      restock: Boolean(input.restock),
      payload: input as unknown as Record<string, unknown>,
      result: null,
    });
    if (inserted === 'duplicate') return this.orderReceipt(order, order.status);

    if (input.kind === 'cancelled') {
      if (order.status === 'posted' && order.documentId) {
        await this.posting.postSalesReturn({
          actor,
          sourceDocumentId: order.documentId,
          idempotencyKey: `commerce-cancel:${actor.connectionId}:${order.externalId}`,
          issueDate: input.effectiveAt.slice(0, 10),
          restock: true,
          amount: Number(order.total),
          lines: order.lines.map((line) => ({
            productId: line.bookoneProductId,
            description: `Cancel ${order.externalId}`,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
          })),
        });
        await this.emitStock(actor);
      }
      if (order.status === 'posted' || order.status === 'received' || order.status === 'needs_review' || order.status === 'accepted') {
        order.status = 'cancelled';
        order.reviewReason = null;
      }
    } else if (input.kind === 'paid') {
      if (order.status === 'received' || order.status === 'needs_review') {
        order.snapshot.payment = { ...(order.snapshot.payment ?? { status: 'paid' }), status: 'paid' };
        if (actor.postingMode === 'posting' && !order.documentId) {
          const preview = await this.validateOrder(actor, order.snapshot);
          const stockIssues: string[] = [];
          for (const line of preview.mapped) {
            if (!line.productId) continue;
            const stock = await this.store.getStock(actor.tenantId, line.productId, actor.locationId);
            if (Number(stock?.quantity ?? '0') < line.quantity) stockIssues.push(line.sku);
          }
          if (preview.ok && !stockIssues.length) {
            const posted = await this.posting.postSalesInvoice({
              actor,
              order: order.snapshot,
              lines: preview.mapped
                .filter((m) => m.productId)
                .map((m) => ({
                  productId: m.productId as string,
                  sku: m.sku,
                  description: m.sku,
                  quantity: m.quantity,
                  unitPrice: m.unitPrice,
                })),
              idempotencyKey: `commerce:${actor.connectionId}:${order.externalId}`,
              locationId: actor.locationId,
              issueDate: order.placedAt.slice(0, 10),
            });
            order.documentId = posted.documentId;
            order.documentNumber = posted.documentNumber;
            order.status = 'posted';
            order.reviewReason = null;
            await this.emitStock(actor);
          } else {
            order.status = 'needs_review';
            order.reviewReason = stockIssues.length
              ? `Paid order cannot be accepted: stock unavailable for ${stockIssues.join(', ')}.`
              : preview.issues.map((i) => i.message).join(' ');
          }
        } else {
          order.status = 'paid';
        }
      }
    } else if (input.kind === 'fulfilled') {
      if (order.status === 'posted' || order.status === 'paid') order.status = 'fulfilled';
      else {
        order.status = 'needs_review';
        order.reviewReason = 'Fulfilment arrived before the order was posted.';
      }
    } else if (input.kind === 'refunded') {
      await this.applyRefund(actor, order, input);
    } else {
      order.status = 'needs_review';
      order.reviewReason = `Unsupported lifecycle event ${input.kind} was staged with no accounting effect.`;
    }
    order.lastAppliedVersion = input.sourceVersion ?? order.lastAppliedVersion;
    order.updatedAt = nowIso();
    await this.store.updateOrder(order);
    return this.orderReceipt(order, order.status);
  }

  reservations(): never {
    fail('RESERVATION_DISABLED', 'Reservation mode is disabled until a cross-channel contention test passes.');
  }

  private async applyRefund(actor: CommerceActor, order: OrderRow, input: OrderEventInput) {
    const amount = parseMoney(input.amount ?? '0', 'Refund amount');
    const already = order.lines.reduce((sum, line) => sum + Number(line.refundedAmount), 0);
    const remaining = Number(order.total) - already;
    if (amount <= 0 || amount - remaining > 0.01) {
      fail('VALIDATION', `Refund amount ${moneyString(amount)} is not valid against remaining ${moneyString(remaining)}.`);
    }
    const refundInsert = await this.store.insertRefund({
      id: randomUUID(),
      tenantId: actor.tenantId,
      connectionId: actor.connectionId,
      orderId: order.id,
      externalRefundId: input.externalRefundId ?? input.externalEventId,
      amount: moneyString(amount),
      restock: Boolean(input.restock),
      documentId: null,
    });
    if (refundInsert === 'duplicate') return;
    if (!order.documentId) {
      order.status = 'needs_review';
      order.reviewReason = 'Refund arrived before its order was posted. No journals were created.';
      return;
    }
    const posted = await this.posting.postSalesReturn({
      actor,
      sourceDocumentId: order.documentId,
      idempotencyKey: `commerce-refund:${actor.connectionId}:${input.externalRefundId}`,
      issueDate: input.effectiveAt.slice(0, 10),
      restock: Boolean(input.restock),
      amount,
      lines: input.restock
        ? order.lines.map((line) => ({
            productId: line.bookoneProductId,
            description: line.sku,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
          }))
        : [
            {
              productId: null,
              description: `Money-only refund ${order.externalId}`,
              quantity: 1,
              unitPrice: amount,
            },
          ],
    });
    for (const line of order.lines) {
      line.refundedAmount = moneyString(Number(line.refundedAmount) + amount / order.lines.length);
      if (input.restock) line.restockedQty = line.quantity;
    }
    order.status = almostEqualRefund(already + amount, Number(order.total)) ? 'refunded' : 'partially_refunded';
    void posted;
    if (input.restock) await this.emitStock(actor);
  }

  private async emitStock(actor: CommerceActor) {
    const mappings = await this.store.listMappings(actor.tenantId, actor.connectionId);
    for (const mapping of mappings) {
      const stock = await this.store.getStock(actor.tenantId, mapping.bookoneProductId, actor.locationId);
      const revision = await this.store.nextRevision(actor.tenantId, actor.connectionId);
      await this.store.insertOutbox({
        id: randomUUID(),
        tenantId: actor.tenantId,
        connectionId: actor.connectionId,
        revision,
        kind: 'inventory',
        productId: mapping.bookoneProductId,
        sku: mapping.sku,
        payload: { sku: mapping.sku, quantity: stock?.quantity ?? '0', revision, asOf: nowIso() },
        createdAt: nowIso(),
      });
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

function almostEqualRefund(a: number, b: number) {
  return Math.abs(a - b) <= 0.01;
}

export function parseScopeQuery(raw: string | null): CommerceScope[] {
  return parseScopes(raw ?? '');
}

export function publicOpenApiPath() {
  return '/api/commerce/v1/openapi.json';
}
