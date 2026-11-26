import { randomUUID } from 'node:crypto';
import { CommerceError } from './errors';
import { defaultScopes, hashSecret, hashesEqual, issueToken, parseScopes, parseToken, redactedCredential } from './credentials';
import { moneyString, parseMoney, parseQty, stableHash } from './money';
import type { CommerceStore } from './store';
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
  PostingPort,
  PublishClaimRow,
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
    return validateOrderInput(input, { currency: actor.currency, mappings, products });
  }

  async submitOrder(actor: CommerceActor, input: OrderInput, idempotencyKey: string | null) {
    this.need(actor, 'order');
    if (actor.inboundPaused) fail('INBOUND_PAUSED', 'Inbound orders are paused for this connection.');
    if (!idempotencyKey?.trim()) fail('VALIDATION', 'Idempotency-Key is required.');
    if (!input.externalId?.trim()) fail('VALIDATION', 'Store order ID is required and is immutable.');
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
    const claimed = this.orderReceipt(order, 'accepted_for_processing');
    await this.store.putIdempotency(actor.tenantId, actor.connectionId, idempotencyKey, {
      payloadHash,
      orderId: order.id,
      receipt: claimed,
    });

    if (status === 'received' && actor.postingMode === 'posting' && preview.ok && input.payment?.status === 'paid' && !stockIssues.length) {
      await this.tryPostInvoice(actor, order, preview);
    }

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

  private async emitStock(actor: CommerceActor, productIds?: string[]) {
    const wanted = productIds?.length ? new Set(productIds) : null;
    const connections = await this.store.listConnections(actor.tenantId);
    for (const connection of connections) {
      if (connection.outboundPaused) continue;
      if ((connection.locationId ?? null) !== (actor.locationId ?? null)) continue;
      const mappings = await this.store.listMappings(actor.tenantId, connection.id);
      for (const mapping of mappings) {
        if (wanted && !wanted.has(mapping.bookoneProductId)) continue;
        const stock = await this.store.getStock(actor.tenantId, mapping.bookoneProductId, connection.locationId);
        const revision = await this.store.nextRevision(actor.tenantId, connection.id);
        await this.store.insertOutbox({
          id: randomUUID(),
          tenantId: actor.tenantId,
          connectionId: connection.id,
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
      }
    }
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
    try {
      const input = order.snapshot;
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
        paymentAccountCode: paymentAccountCode(input),
        idempotencyKey: `commerce:${actor.connectionId}:${input.externalId}`,
        locationId: actor.locationId,
        issueDate: input.placedAt.slice(0, 10),
      });
      order.documentId = posted.documentId;
      order.documentNumber = posted.documentNumber;
      order.status = 'posted';
      order.reviewReason = null;
      order.updatedAt = nowIso();
      await this.store.updateOrder(order);
      await this.emitStock(
        actor,
        preview.mapped.map((line) => line.productId).filter((id): id is string => Boolean(id)),
      );
    } catch (error) {
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
      settlement: order.documentId
        ? paymentAccountCode(order.snapshot)
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
