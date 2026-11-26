import {
  and,
  commerceActivity,
  commerceConnections,
  commerceCredentials,
  commerceIdempotency,
  commerceMappingProposals,
  commerceOrderEvents,
  commerceOrderLines,
  commerceOrders,
  commerceOutbox,
  commerceProductMappings,
  commercePublishClaims,
  commerceRefunds,
  commerceStockCommitments,
  commerceChannelProducts,
  priceLists,
  priceListItems,
  inventoryProductImages,
  inventoryProductCategories,
  inventoryProductBrands,
  inventoryAttributes,
  salesSettings,
  isNull,
  db,
  asc,
  desc,
  eq,
  gt,
  inArray,
  pgClient,
  inventoryProducts,
  inventoryStockLevels,
  sql,
} from '@bookone/db';
import type { CommerceEventRow, CommerceRefundRow, CommerceStore, PriceEntryInput } from './store';
import type { CatalogBundle } from './catalog';
import { EMPTY_PAYMENT_SETTINGS, normalizePaymentSettings } from './payments';
import { EMPTY_FULFILMENT, normalizeFulfilment } from './fulfilment';
import type {
  ActivityRow,
  ConnectionKind,
  ConnectionRow,
  CredentialRow,
  IdempotencyRow,
  MappingProposalRow,
  MappingPreviewRow,
  MappingRow,
  OrderRow,
  PublishClaimRow,
  PublishClaimStatus,
  MappingProposalStatus,
  MappingObservationOrigin,
  OutboxRow,
  ProductRecord,
  StockRecord,
  CommerceEnvironment,
  CommerceScope,
  OrderInput,
  OrderStatus,
  PostingMode,
} from './types';

function flag(v: boolean): '0' | '1' {
  return v ? '1' : '0';
}
function isOn(v: string | null | undefined): boolean {
  return v === '1' || v === 'true';
}

function connectionFrom(row: typeof commerceConnections.$inferSelect): ConnectionRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdByUserId: row.createdByUserId,
    name: row.name,
    kind: row.kind as ConnectionKind,
    environment: row.environment as CommerceEnvironment,
    locationId: row.locationId,
    currency: row.currency,
    postingMode: row.postingMode as PostingMode,
    inboundPaused: isOn(row.inboundPaused),
    outboundPaused: isOn(row.outboundPaused),
    oversellPolicy: 'review',
    reservationMode: 'disabled',
    matchingPolicy: row.matchingPolicy,
    taxMode: row.taxMode,
    paymentSettings: normalizePaymentSettings(row.paymentSettingsJson),
    channelSettings: (row.channelSettingsJson && typeof row.channelSettingsJson === 'object' ? row.channelSettingsJson : {}) as ConnectionRow['channelSettings'],
    status: row.status === 'disconnected' ? 'disconnected' : 'active',
    lastCatalogSyncAt: row.lastCatalogSyncAt?.toISOString() ?? null,
    lastStockSyncAt: row.lastStockSyncAt?.toISOString() ?? null,
    lastOrderSyncAt: row.lastOrderSyncAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function proposalFrom(row: typeof commerceMappingProposals.$inferSelect): MappingProposalRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    connectionId: row.connectionId,
    createdByUserId: row.createdByUserId,
    origin: (row.origin as MappingObservationOrigin) || 'agent',
    status: (row.status as MappingProposalStatus) || 'proposed',
    expectedRevision: Number(row.expectedRevision ?? 1),
    items: (row.itemsJson as MappingPreviewRow[]) ?? [],
    receipt: (row.receiptJson as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function claimFrom(row: typeof commercePublishClaims.$inferSelect): PublishClaimRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    connectionId: row.connectionId,
    bookoneProductId: row.bookoneProductId,
    sku: row.sku,
    claimKey: row.claimKey,
    status: (row.status as PublishClaimStatus) || 'claimed',
    externalProductId: row.externalProductId,
    externalVariantId: row.externalVariantId,
    issue: row.issue,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function credentialFrom(row: typeof commerceCredentials.$inferSelect): CredentialRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    connectionId: row.connectionId,
    createdByUserId: row.createdByUserId,
    prefix: row.prefix,
    secretHash: row.secretHash,
    scopes: row.scopes.split(',').filter(Boolean) as CommerceScope[],
    status: row.status as CredentialRow['status'],
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    rotatedFromId: row.rotatedFromId,
    createdAt: row.createdAt.toISOString(),
  };
}

export class PostgresCommerceStore implements CommerceStore {
  async insertConnection(row: ConnectionRow) {
    await db().insert(commerceConnections).values({
      id: row.id,
      tenantId: row.tenantId,
      createdByUserId: row.createdByUserId,
      name: row.name,
      kind: row.kind,
      environment: row.environment,
      locationId: row.locationId,
      currency: row.currency,
      postingMode: row.postingMode,
      inboundPaused: flag(row.inboundPaused),
      outboundPaused: flag(row.outboundPaused),
      oversellPolicy: row.oversellPolicy,
      reservationMode: row.reservationMode,
      matchingPolicy: row.matchingPolicy,
      taxMode: row.taxMode,
      paymentSettingsJson: row.paymentSettings ?? EMPTY_PAYMENT_SETTINGS,
      status: row.status,
    });
  }

  async getConnection(tenantId: string, id: string) {
    const [row] = await db()
      .select()
      .from(commerceConnections)
      .where(and(eq(commerceConnections.tenantId, tenantId), eq(commerceConnections.id, id)))
      .limit(1);
    return row ? connectionFrom(row) : null;
  }

  async listConnections(tenantId: string) {
    const rows = await db()
      .select()
      .from(commerceConnections)
      .where(eq(commerceConnections.tenantId, tenantId))
      .orderBy(desc(commerceConnections.createdAt));
    return rows.map(connectionFrom);
  }

  async updateConnection(row: ConnectionRow) {
    await db()
      .update(commerceConnections)
      .set({
        name: row.name,
        postingMode: row.postingMode,
        inboundPaused: flag(row.inboundPaused),
        outboundPaused: flag(row.outboundPaused),
        locationId: row.locationId,
        paymentSettingsJson: row.paymentSettings ?? EMPTY_PAYMENT_SETTINGS,
        channelSettingsJson: row.channelSettings ?? {},
        lastCatalogSyncAt: row.lastCatalogSyncAt ? new Date(row.lastCatalogSyncAt) : null,
        lastStockSyncAt: row.lastStockSyncAt ? new Date(row.lastStockSyncAt) : null,
        lastOrderSyncAt: row.lastOrderSyncAt ? new Date(row.lastOrderSyncAt) : null,
        lastError: row.lastError,
        status: row.status,
        updatedAt: new Date(),
      })
      .where(and(eq(commerceConnections.tenantId, row.tenantId), eq(commerceConnections.id, row.id)));
  }

  async insertCredential(row: CredentialRow) {
    await db().insert(commerceCredentials).values({
      id: row.id,
      tenantId: row.tenantId,
      connectionId: row.connectionId,
      createdByUserId: row.createdByUserId,
      prefix: row.prefix,
      secretHash: row.secretHash,
      scopes: row.scopes.join(','),
      status: row.status,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
      rotatedFromId: row.rotatedFromId,
    });
  }

  async getCredentialByPrefix(prefix: string) {
    const rows = await pgClient()<
      {
        tenant_id: string;
        id: string;
        connection_id: string;
        created_by_user_id: string;
        prefix: string;
        secret_hash: string;
        scopes: string;
        status: string;
        expires_at: Date | string | null;
        last_used_at: Date | string | null;
        rotated_from_id: string | null;
        created_at: Date | string;
      }[]
    >`SELECT * FROM bookone_commerce_lookup_credential(${prefix})`;
    const row = rows[0];
    if (!row) return null;
    return credentialFrom({
      id: row.id,
      tenantId: row.tenant_id,
      connectionId: row.connection_id,
      createdByUserId: row.created_by_user_id,
      prefix: row.prefix,
      secretHash: row.secret_hash,
      scopes: row.scopes,
      status: row.status,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
      rotatedFromId: row.rotated_from_id,
      rotatedAt: null,
      revokedAt: null,
      createdAt: new Date(row.created_at),
    });
  }

  async listCredentials(tenantId: string, connectionId: string) {
    const rows = await db()
      .select()
      .from(commerceCredentials)
      .where(and(eq(commerceCredentials.tenantId, tenantId), eq(commerceCredentials.connectionId, connectionId)));
    return rows.map(credentialFrom);
  }

  async updateCredential(row: CredentialRow) {
    await db()
      .update(commerceCredentials)
      .set({
        status: row.status,
        lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt) : null,
        expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
        rotatedFromId: row.rotatedFromId,
        rotatedAt: row.status === 'rotated' ? new Date() : null,
        revokedAt: row.status === 'revoked' ? new Date() : null,
      })
      .where(and(eq(commerceCredentials.tenantId, row.tenantId), eq(commerceCredentials.id, row.id)));
  }

  async listMappings(tenantId: string, connectionId: string) {
    const rows = await db()
      .select()
      .from(commerceProductMappings)
      .where(and(eq(commerceProductMappings.tenantId, tenantId), eq(commerceProductMappings.connectionId, connectionId)));
    return rows.map(
      (row): MappingRow => ({
        id: row.id,
        tenantId: row.tenantId,
        connectionId: row.connectionId,
        bookoneProductId: row.bookoneProductId,
        sku: row.sku,
        externalProductId: row.externalProductId,
        externalVariantId: row.externalVariantId,
        status: row.status,
        optedInFields: row.optedInFields.split(',').filter(Boolean),
      }),
    );
  }

  async upsertMapping(row: MappingRow) {
    const existing = await db()
      .select()
      .from(commerceProductMappings)
      .where(
        and(
          eq(commerceProductMappings.tenantId, row.tenantId),
          eq(commerceProductMappings.connectionId, row.connectionId),
          eq(commerceProductMappings.bookoneProductId, row.bookoneProductId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      await db()
        .update(commerceProductMappings)
        .set({
          sku: row.sku,
          externalProductId: row.externalProductId,
          externalVariantId: row.externalVariantId,
          status: row.status,
          optedInFields: row.optedInFields.join(','),
          updatedAt: new Date(),
        })
        .where(eq(commerceProductMappings.id, existing[0].id));
      return;
    }
    await db().insert(commerceProductMappings).values({
      id: row.id,
      tenantId: row.tenantId,
      connectionId: row.connectionId,
      bookoneProductId: row.bookoneProductId,
      sku: row.sku,
      externalProductId: row.externalProductId,
      externalVariantId: row.externalVariantId,
      status: row.status,
      optedInFields: row.optedInFields.join(','),
    });
  }

  async deleteMapping(tenantId: string, id: string) {
    await db()
      .delete(commerceProductMappings)
      .where(and(eq(commerceProductMappings.tenantId, tenantId), eq(commerceProductMappings.id, id)));
  }

  async insertMappingProposal(row: MappingProposalRow) {
    await db().insert(commerceMappingProposals).values({
      id: row.id,
      tenantId: row.tenantId,
      connectionId: row.connectionId,
      createdByUserId: row.createdByUserId,
      origin: row.origin,
      status: row.status,
      expectedRevision: row.expectedRevision,
      itemsJson: row.items,
      receiptJson: row.receipt,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }

  async getMappingProposal(tenantId: string, id: string): Promise<MappingProposalRow | null> {
    const [row] = await db()
      .select()
      .from(commerceMappingProposals)
      .where(and(eq(commerceMappingProposals.tenantId, tenantId), eq(commerceMappingProposals.id, id)))
      .limit(1);
    return row ? proposalFrom(row) : null;
  }

  async listMappingProposals(tenantId: string, connectionId: string): Promise<MappingProposalRow[]> {
    const rows = await db()
      .select()
      .from(commerceMappingProposals)
      .where(
        and(eq(commerceMappingProposals.tenantId, tenantId), eq(commerceMappingProposals.connectionId, connectionId)),
      )
      .orderBy(desc(commerceMappingProposals.createdAt));
    return rows.map(proposalFrom);
  }

  async updateMappingProposal(row: MappingProposalRow) {
    await db()
      .update(commerceMappingProposals)
      .set({
        status: row.status,
        expectedRevision: row.expectedRevision,
        itemsJson: row.items,
        receiptJson: row.receipt,
        updatedAt: new Date(row.updatedAt),
      })
      .where(eq(commerceMappingProposals.id, row.id));
  }

  async upsertPublishClaim(row: PublishClaimRow) {
    const existing = await this.getPublishClaim(row.tenantId, row.connectionId, row.bookoneProductId);
    if (existing) {
      await db()
        .update(commercePublishClaims)
        .set({
          sku: row.sku,
          claimKey: row.claimKey,
          status: row.status,
          externalProductId: row.externalProductId,
          externalVariantId: row.externalVariantId,
          issue: row.issue,
          updatedAt: new Date(row.updatedAt),
        })
        .where(eq(commercePublishClaims.id, existing.id));
      return;
    }
    await db().insert(commercePublishClaims).values({
      id: row.id,
      tenantId: row.tenantId,
      connectionId: row.connectionId,
      bookoneProductId: row.bookoneProductId,
      sku: row.sku,
      claimKey: row.claimKey,
      status: row.status,
      externalProductId: row.externalProductId,
      externalVariantId: row.externalVariantId,
      issue: row.issue,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }

  async getPublishClaim(tenantId: string, connectionId: string, bookoneProductId: string): Promise<PublishClaimRow | null> {
    const [row] = await db()
      .select()
      .from(commercePublishClaims)
      .where(
        and(
          eq(commercePublishClaims.tenantId, tenantId),
          eq(commercePublishClaims.connectionId, connectionId),
          eq(commercePublishClaims.bookoneProductId, bookoneProductId),
        ),
      )
      .limit(1);
    return row ? claimFrom(row) : null;
  }

  async getPublishClaimByKey(tenantId: string, connectionId: string, claimKey: string): Promise<PublishClaimRow | null> {
    const [row] = await db()
      .select()
      .from(commercePublishClaims)
      .where(
        and(
          eq(commercePublishClaims.tenantId, tenantId),
          eq(commercePublishClaims.connectionId, connectionId),
          eq(commercePublishClaims.claimKey, claimKey),
        ),
      )
      .limit(1);
    return row ? claimFrom(row) : null;
  }

  async listPublishClaims(tenantId: string, connectionId: string): Promise<PublishClaimRow[]> {
    const rows = await db()
      .select()
      .from(commercePublishClaims)
      .where(and(eq(commercePublishClaims.tenantId, tenantId), eq(commercePublishClaims.connectionId, connectionId)));
    return rows.map(claimFrom);
  }

  async getProduct(tenantId: string, id: string): Promise<ProductRecord | null> {
    const [row] = await db()
      .select()
      .from(inventoryProducts)
      .where(and(eq(inventoryProducts.tenantId, tenantId), eq(inventoryProducts.id, id)))
      .limit(1);
    return row ? productFrom(row) : null;
  }

  async findProductBySku(tenantId: string, sku: string): Promise<ProductRecord | null> {
    const [row] = await db()
      .select()
      .from(inventoryProducts)
      .where(and(eq(inventoryProducts.tenantId, tenantId), eq(inventoryProducts.sku, sku)))
      .limit(1);
    return row ? productFrom(row) : null;
  }

  async listSellableProducts(tenantId: string): Promise<ProductRecord[]> {
    const rows = await db().select().from(inventoryProducts).where(eq(inventoryProducts.tenantId, tenantId));
    return rows.map(productFrom);
  }

  async getStock(tenantId: string, productId: string, locationId: string | null): Promise<StockRecord | null> {
    const rows = await db()
      .select()
      .from(inventoryStockLevels)
      .where(and(eq(inventoryStockLevels.tenantId, tenantId), eq(inventoryStockLevels.productId, productId)));
    const row = locationId ? rows.find((r) => r.locationId === locationId) ?? rows[0] : rows[0];
    if (!row) return null;
    return {
      productId: row.productId,
      sku: '',
      locationId: row.locationId,
      quantity: String(Number(row.qtyOnHand)),
      revision: Math.floor(row.updatedAt.getTime() / 1000),
      asOf: row.updatedAt.toISOString(),
      stale: false,
    };
  }

  async listStock(tenantId: string, locationId: string | null): Promise<StockRecord[]> {
    const rows = await db().select().from(inventoryStockLevels).where(eq(inventoryStockLevels.tenantId, tenantId));
    return rows
      .filter((r) => !locationId || r.locationId === locationId || !r.locationId)
      .map((row) => ({
        productId: row.productId,
        sku: '',
        locationId: row.locationId,
        quantity: String(Number(row.qtyOnHand)),
        revision: Math.floor(row.updatedAt.getTime() / 1000),
        asOf: row.updatedAt.toISOString(),
        stale: false,
      }));
  }

  async getOrderByExternalId(tenantId: string, connectionId: string, externalId: string) {
    const [row] = await db()
      .select()
      .from(commerceOrders)
      .where(
        and(
          eq(commerceOrders.tenantId, tenantId),
          eq(commerceOrders.connectionId, connectionId),
          eq(commerceOrders.externalId, externalId),
        ),
      )
      .limit(1);
    if (!row) return null;
    const lines = await db().select().from(commerceOrderLines).where(eq(commerceOrderLines.orderId, row.id));
    return orderFrom(row, lines);
  }

  async insertOrder(row: OrderRow) {
    await db().insert(commerceOrders).values({
      id: row.id,
      tenantId: row.tenantId,
      connectionId: row.connectionId,
      externalId: row.externalId,
      status: row.status,
      reviewReason: row.reviewReason,
      currency: row.currency,
      total: row.total,
      payloadHash: row.payloadHash,
      snapshotJson: row.snapshot,
      sourceVersion: row.sourceVersion,
      sourceTimezone: row.sourceTimezone,
      placedAt: new Date(row.placedAt),
      documentId: row.documentId,
      documentNumber: row.documentNumber,
      settlementAccountCode: row.settlementAccountCode ?? null,
      fulfilmentJson: row.fulfilment ?? EMPTY_FULFILMENT,
      lastAppliedVersion: row.lastAppliedVersion,
    });
    if (row.lines.length) {
      await db().insert(commerceOrderLines).values(
        row.lines.map((line) => ({
          id: line.id,
          tenantId: row.tenantId,
          orderId: row.id,
          connectionId: row.connectionId,
          externalLineId: line.externalLineId,
          sku: line.sku,
          bookoneProductId: line.bookoneProductId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxAmount: line.taxAmount,
          discountAmount: line.discountAmount,
          restockedQty: line.restockedQty,
          refundedAmount: line.refundedAmount,
        })),
      );
    }
  }

  async updateOrder(row: OrderRow) {
    await db()
      .update(commerceOrders)
      .set({
        status: row.status,
        reviewReason: row.reviewReason,
        documentId: row.documentId,
        documentNumber: row.documentNumber,
        settlementAccountCode: row.settlementAccountCode ?? null,
        fulfilmentJson: row.fulfilment ?? EMPTY_FULFILMENT,
        lastAppliedVersion: row.lastAppliedVersion,
        snapshotJson: row.snapshot,
        updatedAt: new Date(),
      })
      .where(and(eq(commerceOrders.tenantId, row.tenantId), eq(commerceOrders.id, row.id)));
    for (const line of row.lines) {
      await db()
        .update(commerceOrderLines)
        .set({ restockedQty: line.restockedQty, refundedAmount: line.refundedAmount })
        .where(eq(commerceOrderLines.id, line.id));
    }
  }


  async catalogBundle(tenantId: string, connectionId: string): Promise<CatalogBundle> {
    const connection = await this.getConnection(tenantId, connectionId);
    const locationId = connection?.locationId ?? null;
    const products = await db()
      .select()
      .from(inventoryProducts)
      .where(and(eq(inventoryProducts.tenantId, tenantId), isNull(inventoryProducts.voidedAt)));
    const images = await db()
      .select()
      .from(inventoryProductImages)
      .where(and(eq(inventoryProductImages.tenantId, tenantId), isNull(inventoryProductImages.voidedAt)));
    const categories = await db()
      .select()
      .from(inventoryProductCategories)
      .where(and(eq(inventoryProductCategories.tenantId, tenantId), isNull(inventoryProductCategories.voidedAt)));
    const brands = await db()
      .select()
      .from(inventoryProductBrands)
      .where(and(eq(inventoryProductBrands.tenantId, tenantId), isNull(inventoryProductBrands.voidedAt)));
    const attributes = await db()
      .select()
      .from(inventoryAttributes)
      .where(and(eq(inventoryAttributes.tenantId, tenantId), isNull(inventoryAttributes.voidedAt)));
    const published = await db()
      .select({ productId: commerceChannelProducts.productId })
      .from(commerceChannelProducts)
      .where(and(eq(commerceChannelProducts.tenantId, tenantId), eq(commerceChannelProducts.connectionId, connectionId)));
    const mappings = await this.listMappings(tenantId, connectionId);
    const levels = await db().select().from(inventoryStockLevels).where(eq(inventoryStockLevels.tenantId, tenantId));
    const commitments = await db()
      .select({ productId: commerceStockCommitments.productId, locationId: commerceStockCommitments.locationId, quantity: commerceStockCommitments.quantity })
      .from(commerceStockCommitments)
      .where(and(eq(commerceStockCommitments.tenantId, tenantId), eq(commerceStockCommitments.status, 'active')));
    const lists = await db()
      .select()
      .from(priceLists)
      .where(and(eq(priceLists.tenantId, tenantId), isNull(priceLists.voidedAt)));
    const items = lists.length
      ? await db().select().from(priceListItems).where(eq(priceListItems.tenantId, tenantId))
      : [];
    const [vat] = await db()
      .select({ vatRegistered: salesSettings.vatRegistered, vatRatePercent: salesSettings.vatRatePercent })
      .from(salesSettings)
      .where(eq(salesSettings.tenantId, tenantId))
      .limit(1);
    const onHand = new Map<string, number>();
    for (const l of levels) {
      if ((l.locationId ?? null) !== locationId) continue;
      onHand.set(l.productId, (onHand.get(l.productId) ?? 0) + Number(l.qtyOnHand));
    }
    const committed = new Map<string, number>();
    for (const c of commitments) {
      if ((c.locationId ?? null) !== locationId) continue;
      committed.set(c.productId, (committed.get(c.productId) ?? 0) + Number(c.quantity));
    }
    const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
    const ch = connection?.channelSettings ?? {};
    return {
      products: products.map((r) => ({
        id: r.id,
        sku: r.sku,
        name: r.name,
        shortName: r.shortName,
        description: r.description,
        longDescription: r.longDescription,
        productType: r.productType,
        unit: r.unit,
        sellPrice: String(r.sellPrice),
        categoryId: r.categoryId,
        productBrandId: r.productBrandId,
        barcode: r.barcode,
        extraBarcodes: arr<string>(r.extraBarcodes).map(String),
        tags: arr<string>(r.tags).map(String),
        attributeValues: arr<{ code: string; value: string }>(r.attributeValues),
        weightGrams: r.weightGrams,
        lengthMm: r.lengthMm,
        widthMm: r.widthMm,
        heightMm: r.heightMm,
        fragile: r.fragile === '1',
        taxStatus: r.taxStatus,
        minOrderQty: r.minOrderQty === null ? null : String(r.minOrderQty),
        maxOrderQty: r.maxOrderQty === null ? null : String(r.maxOrderQty),
        orderQtyStep: r.orderQtyStep === null ? null : String(r.orderQtyStep),
        allowBackorder: r.allowBackorder === '1',
        parentProductId: r.parentProductId,
        variantOptions: arr<{ name: string; value: string }>(r.variantOptions),
        productOptions: arr<{ name: string; values: string[] }>(r.productOptions),
        swatchHex: r.swatchHex,
        variantSortOrder: r.variantSortOrder,
        isDefaultVariant: r.isDefaultVariant === '1',
        sellable: r.sellable === '1',
        isActive: r.isActive === '1',
        archived: r.isActive !== '1',
        imageKey: r.imageKey,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      images: images.map((i) => ({
        id: i.id,
        productId: i.productId,
        width: i.width,
        height: i.height,
        alt: i.alt,
        position: i.position,
        checksum: i.checksum,
        updatedAt: i.updatedAt.toISOString(),
      })),
      categories: categories.map((c) => ({
        id: c.id,
        parentId: c.parentId,
        name: c.name,
        slug: c.slug,
        description: c.description ?? null,
        imageUrl: null,
        sortOrder: c.sortOrder,
        archived: false,
        updatedAt: c.updatedAt.toISOString(),
      })),
      brands: brands.map((x) => ({
        id: x.id,
        name: x.name,
        slug: x.slug,
        description: x.description,
        websiteUrl: x.websiteUrl,
        logoUrl: null,
        archived: false,
        updatedAt: x.updatedAt.toISOString(),
      })),
      attributes: attributes.map((a) => ({
        code: a.code,
        name: a.name,
        type: a.type,
        unit: a.unit,
        allowedValues: arr<string>(a.allowedValues).map(String),
        filterable: a.filterable === '1',
      })),
      published: new Set(published.map((p) => p.productId)),
      mapped: new Map(mappings.map((m) => [m.bookoneProductId, { externalProductId: m.externalProductId, externalVariantId: m.externalVariantId }])),
      onHand,
      committed,
      currency: connection?.currency ?? 'LKR',
      vatRatePercent: Number(vat?.vatRatePercent ?? 18),
      vatRegistered: vat?.vatRegistered === '1',
      channel: {
        safetyBuffer: Math.max(0, Number(ch.safetyBuffer ?? 0) || 0),
        allowBackorder: Boolean(ch.allowBackorder),
        timezone: ch.timezone || 'Asia/Colombo',
        priceListId: ch.priceListId ?? null,
      },
      priceLists: lists.map((l) => ({
        id: l.id,
        name: l.name,
        currency: l.currency,
        customerGroup: l.customerGroup,
        updatedAt: l.updatedAt.toISOString(),
        entries: new Map(
          items
            .filter((i) => i.priceListId === l.id)
            .map((i) => [
              i.productId,
              {
                productId: i.productId,
                price: i.price,
                compareAtPrice: i.compareAtPrice,
                salePrice: i.salePrice,
                saleStartsAt: i.saleStartsAt?.toISOString() ?? null,
                saleEndsAt: i.saleEndsAt?.toISOString() ?? null,
                tiers: arr<{ minQty: string; price: string }>(i.tiers),
                updatedAt: i.updatedAt.toISOString(),
              },
            ]),
        ),
      })),
    };
  }


  async listPriceLists(tenantId: string) {
    const rows = await db()
      .select({
        id: priceLists.id,
        name: priceLists.name,
        currency: priceLists.currency,
        customerGroup: priceLists.customerGroup,
        itemCount: sql<number>`(select count(*) from price_list_items i where i.price_list_id = ${priceLists.id})`,
      })
      .from(priceLists)
      .where(and(eq(priceLists.tenantId, tenantId), isNull(priceLists.voidedAt)))
      .orderBy(asc(priceLists.name));
    return rows.map((r) => ({ ...r, itemCount: Number(r.itemCount ?? 0) }));
  }

  async savePriceList(tenantId: string, input: { id?: string; name: string; currency: string; customerGroup: string | null; archive?: boolean }) {
    if (input.id) {
      await db()
        .update(priceLists)
        .set(
          input.archive
            ? { voidedAt: new Date(), updatedAt: new Date() }
            : { name: input.name, currency: input.currency, customerGroup: input.customerGroup, updatedAt: new Date() },
        )
        .where(and(eq(priceLists.tenantId, tenantId), eq(priceLists.id, input.id)));
      return input.id;
    }
    const [row] = await db()
      .insert(priceLists)
      .values({ tenantId, name: input.name, currency: input.currency, customerGroup: input.customerGroup })
      .returning({ id: priceLists.id });
    return row!.id;
  }

  async upsertPriceEntries(tenantId: string, priceListId: string, rows: PriceEntryInput[]) {
    let n = 0;
    for (const r of rows) {
      const empty = !r.price && !r.compareAtPrice && !r.salePrice && !r.tiers.length;
      if (empty) {
        const del = await db()
          .delete(priceListItems)
          .where(and(eq(priceListItems.tenantId, tenantId), eq(priceListItems.priceListId, priceListId), eq(priceListItems.productId, r.productId)))
          .returning({ id: priceListItems.id });
        n += del.length;
        continue;
      }
      const values = {
        price: r.price,
        compareAtPrice: r.compareAtPrice,
        salePrice: r.salePrice,
        saleStartsAt: r.saleStartsAt ? new Date(r.saleStartsAt) : null,
        saleEndsAt: r.saleEndsAt ? new Date(r.saleEndsAt) : null,
        tiers: r.tiers,
        updatedAt: new Date(),
      };
      await db()
        .insert(priceListItems)
        .values({ tenantId, priceListId, productId: r.productId, ...values })
        .onConflictDoUpdate({ target: [priceListItems.priceListId, priceListItems.productId], set: values });
      n += 1;
    }
    return n;
  }

  async saleBoundaryProductIds(tenantId: string, priceListId: string, fromIso: string, toIso: string) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const rows = await db()
      .select({ productId: priceListItems.productId })
      .from(priceListItems)
      .where(
        and(
          eq(priceListItems.tenantId, tenantId),
          eq(priceListItems.priceListId, priceListId),
          sql`((${priceListItems.saleStartsAt} > ${from} and ${priceListItems.saleStartsAt} <= ${to}) or (${priceListItems.saleEndsAt} > ${from} and ${priceListItems.saleEndsAt} <= ${to}))`,
        ),
      );
    return rows.map((r) => r.productId);
  }

  async listChannelProductIds(tenantId: string, connectionId: string) {
    const rows = await db()
      .select({ productId: commerceChannelProducts.productId })
      .from(commerceChannelProducts)
      .where(and(eq(commerceChannelProducts.tenantId, tenantId), eq(commerceChannelProducts.connectionId, connectionId)));
    return rows.map((r) => r.productId);
  }

  async setChannelProducts(tenantId: string, connectionId: string, productIds: string[], published: boolean) {
    const ids = [...new Set(productIds)].filter(Boolean);
    if (!ids.length) return 0;
    if (published) {
      const rows = await db()
        .insert(commerceChannelProducts)
        .values(ids.map((productId) => ({ tenantId, connectionId, productId })))
        .onConflictDoUpdate({ target: [commerceChannelProducts.connectionId, commerceChannelProducts.productId], set: { updatedAt: new Date() } })
        .returning({ productId: commerceChannelProducts.productId });
      return rows.length;
    }
    const rows = await db()
      .delete(commerceChannelProducts)
      .where(
        and(
          eq(commerceChannelProducts.tenantId, tenantId),
          eq(commerceChannelProducts.connectionId, connectionId),
          inArray(commerceChannelProducts.productId, ids),
        ),
      )
      .returning({ productId: commerceChannelProducts.productId });
    return rows.length;
  }

  async getOrderById(tenantId: string, orderId: string) {
    const [row] = await db()
      .select()
      .from(commerceOrders)
      .where(and(eq(commerceOrders.tenantId, tenantId), eq(commerceOrders.id, orderId)))
      .limit(1);
    if (!row) return null;
    const lines = await db().select().from(commerceOrderLines).where(eq(commerceOrderLines.orderId, row.id));
    return orderFrom(row, lines);
  }

  async committedQty(tenantId: string, productId: string, locationId: string | null) {
    const [row] = await db()
      .select({ total: sql<string>`coalesce(sum(${commerceStockCommitments.quantity}::numeric), 0)` })
      .from(commerceStockCommitments)
      .where(
        and(
          eq(commerceStockCommitments.tenantId, tenantId),
          eq(commerceStockCommitments.productId, productId),
          eq(commerceStockCommitments.status, 'active'),
          locationId
            ? eq(commerceStockCommitments.locationId, locationId)
            : sql`${commerceStockCommitments.locationId} is null`,
        ),
      );
    return Number(row?.total ?? 0);
  }

  async commitStock(input: {
    tenantId: string;
    connectionId: string;
    orderId: string;
    locationId: string | null;
    lines: Array<{ productId: string; quantity: number }>;
  }): Promise<{ ok: true } | { ok: false; short: Array<{ productId: string; available: number; needed: number }> }> {
    const byProduct = new Map<string, number>();
    for (const line of input.lines) byProduct.set(line.productId, (byProduct.get(line.productId) ?? 0) + line.quantity);
    return db().transaction(async (tx) => {
      const short: Array<{ productId: string; available: number; needed: number }> = [];
      for (const [productId, needed] of [...byProduct.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        // Same lock key as posting (apps/web lib/inventory-costing lockProductStock).
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`stock:${input.tenantId}:${productId}`}, 0))`);
        const stock = await this.getStock(input.tenantId, productId, input.locationId);
        const committed = await this.committedQty(input.tenantId, productId, input.locationId);
        const available = Number(stock?.quantity ?? 0) - committed;
        if (available + 1e-9 < needed) short.push({ productId, available: Math.max(0, available), needed });
      }
      if (short.length) return { ok: false as const, short };
      for (const [productId, quantity] of byProduct.entries()) {
        await tx.insert(commerceStockCommitments).values({
          tenantId: input.tenantId,
          connectionId: input.connectionId,
          orderId: input.orderId,
          productId,
          locationId: input.locationId,
          quantity: String(quantity),
          status: 'active',
        });
      }
      return { ok: true as const };
    });
  }

  async settleCommitments(tenantId: string, orderId: string, status: 'released' | 'consumed' | 'active') {
    const from = status === 'active' ? 'consumed' : 'active';
    const rows = await db()
      .update(commerceStockCommitments)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(commerceStockCommitments.tenantId, tenantId),
          eq(commerceStockCommitments.orderId, orderId),
          eq(commerceStockCommitments.status, from),
        ),
      )
      .returning({ id: commerceStockCommitments.id });
    return rows.length;
  }

  async listOrders(tenantId: string, connectionId?: string, status?: string) {
    // Filter in SQL and load all lines in one query (the Orders tab lists every order).
    const rows = await db()
      .select()
      .from(commerceOrders)
      .where(
        and(
          eq(commerceOrders.tenantId, tenantId),
          connectionId ? eq(commerceOrders.connectionId, connectionId) : undefined,
          status ? eq(commerceOrders.status, status) : undefined,
        ),
      )
      .orderBy(desc(commerceOrders.createdAt))
      .limit(500);
    if (!rows.length) return [];
    const lines = await db()
      .select()
      .from(commerceOrderLines)
      .where(inArray(commerceOrderLines.orderId, rows.map((r) => r.id)));
    const byOrder = new Map<string, (typeof commerceOrderLines.$inferSelect)[]>();
    for (const line of lines) {
      const list = byOrder.get(line.orderId) ?? [];
      list.push(line);
      byOrder.set(line.orderId, list);
    }
    return rows.map((row) => orderFrom(row, byOrder.get(row.id) ?? []));
  }

  async getIdempotency(tenantId: string, connectionId: string, key: string) {
    const [row] = await db()
      .select()
      .from(commerceIdempotency)
      .where(
        and(
          eq(commerceIdempotency.tenantId, tenantId),
          eq(commerceIdempotency.connectionId, connectionId),
          eq(commerceIdempotency.idempotencyKey, key),
        ),
      )
      .limit(1);
    if (!row) return null;
    return { payloadHash: row.payloadHash, orderId: row.orderId, receipt: row.receiptJson as IdempotencyRow['receipt'] };
  }

  async putIdempotency(tenantId: string, connectionId: string, key: string, row: IdempotencyRow) {
    await db()
      .insert(commerceIdempotency)
      .values({
        tenantId,
        connectionId,
        idempotencyKey: key,
        payloadHash: row.payloadHash,
        orderId: row.orderId,
        receiptJson: row.receipt,
      })
      .onConflictDoUpdate({
        target: [commerceIdempotency.tenantId, commerceIdempotency.connectionId, commerceIdempotency.idempotencyKey],
        set: {
          payloadHash: row.payloadHash,
          orderId: row.orderId,
          receiptJson: row.receipt,
        },
      });
  }

  async insertEvent(row: CommerceEventRow) {
    try {
      await db().insert(commerceOrderEvents).values({
        id: row.id,
        tenantId: row.tenantId,
        connectionId: row.connectionId,
        orderId: row.orderId,
        externalEventId: row.externalEventId,
        kind: row.kind,
        status: row.status,
        sourceVersion: row.sourceVersion,
        effectiveAt: new Date(row.effectiveAt),
        amount: row.amount,
        restock: flag(row.restock),
        payloadJson: row.payload,
        resultJson: row.result,
      });
      return 'inserted' as const;
    } catch (error) {
      if (isUniqueViolation(error, 'commerce_order_events_external_uq')) return 'duplicate';
      throw error;
    }
  }

  async listOrderEvents(tenantId: string, connectionId: string, orderId: string) {
    const rows = await db()
      .select()
      .from(commerceOrderEvents)
      .where(
        and(
          eq(commerceOrderEvents.tenantId, tenantId),
          eq(commerceOrderEvents.connectionId, connectionId),
          eq(commerceOrderEvents.orderId, orderId),
        ),
      )
      .orderBy(asc(commerceOrderEvents.createdAt));
    return rows.map(eventFrom);
  }

  async getEvent(tenantId: string, connectionId: string, externalEventId: string) {
    const [row] = await db()
      .select()
      .from(commerceOrderEvents)
      .where(
        and(
          eq(commerceOrderEvents.tenantId, tenantId),
          eq(commerceOrderEvents.connectionId, connectionId),
          eq(commerceOrderEvents.externalEventId, externalEventId),
        ),
      )
      .limit(1);
    return row ? eventFrom(row) : null;
  }

  async updateEvent(id: string, patch: { status: string; result?: Record<string, unknown> | null }) {
    const set: { status: string; resultJson?: Record<string, unknown> | null } = { status: patch.status };
    if (patch.result !== undefined) set.resultJson = patch.result;
    await db().update(commerceOrderEvents).set(set).where(eq(commerceOrderEvents.id, id));
  }

  async insertRefund(row: CommerceRefundRow) {
    try {
      await db().insert(commerceRefunds).values({
        id: row.id,
        tenantId: row.tenantId,
        connectionId: row.connectionId,
        orderId: row.orderId,
        externalRefundId: row.externalRefundId,
        amount: row.amount,
        restock: flag(row.restock),
        documentId: row.documentId,
      });
      return 'inserted' as const;
    } catch (error) {
      if (isUniqueViolation(error, 'commerce_refunds_external_uq')) return 'duplicate';
      throw error;
    }
  }

  async getRefund(tenantId: string, connectionId: string, externalRefundId: string) {
    const [row] = await db()
      .select()
      .from(commerceRefunds)
      .where(
        and(
          eq(commerceRefunds.tenantId, tenantId),
          eq(commerceRefunds.connectionId, connectionId),
          eq(commerceRefunds.externalRefundId, externalRefundId),
        ),
      )
      .limit(1);
    return row ? refundFrom(row) : null;
  }

  async updateRefund(id: string, patch: { documentId: string | null }) {
    await db().update(commerceRefunds).set({ documentId: patch.documentId }).where(eq(commerceRefunds.id, id));
  }

  async nextRevision(tenantId: string, connectionId: string) {
    const [row] = await db()
      .select({ max: sql<number>`coalesce(max(${commerceOutbox.revision}), 0)` })
      .from(commerceOutbox)
      .where(and(eq(commerceOutbox.tenantId, tenantId), eq(commerceOutbox.connectionId, connectionId)));
    return Number(row?.max ?? 0) + 1;
  }

  async insertOutbox(row: OutboxRow & { tenantId: string; connectionId: string }) {
    let revision = row.revision;
    for (let attempt = 0; attempt < 16; attempt++) {
      try {
        await db().insert(commerceOutbox).values({
          id: row.id,
          tenantId: row.tenantId,
          connectionId: row.connectionId,
          revision,
          kind: row.kind,
          productId: row.productId,
          sku: row.sku,
          payloadJson: { ...row.payload, revision },
        });
        return;
      } catch (error) {
        if (!isUniqueViolation(error, 'commerce_outbox_revision_uq')) throw error;
        revision = await this.nextRevision(row.tenantId, row.connectionId);
      }
    }
    throw new Error('Could not allocate a commerce outbox revision.');
  }

  async listOutbox(tenantId: string, connectionId: string, afterRevision: number, limit: number) {
    const rows = await db()
      .select()
      .from(commerceOutbox)
      .where(
        and(
          eq(commerceOutbox.tenantId, tenantId),
          eq(commerceOutbox.connectionId, connectionId),
          gt(commerceOutbox.revision, afterRevision),
        ),
      )
      .orderBy(commerceOutbox.revision)
      .limit(limit);
    return rows.map(
      (row): OutboxRow => ({
        id: row.id,
        revision: Number(row.revision),
        kind: row.kind,
        productId: row.productId,
        sku: row.sku,
        payload: row.payloadJson as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      }),
    );
  }

  async maxRevision(tenantId: string, connectionId: string) {
    const [row] = await db()
      .select({ max: sql<number>`coalesce(max(${commerceOutbox.revision}), 0)` })
      .from(commerceOutbox)
      .where(and(eq(commerceOutbox.tenantId, tenantId), eq(commerceOutbox.connectionId, connectionId)));
    return Number(row?.max ?? 0);
  }

  async insertActivity(row: ActivityRow & { tenantId: string }) {
    await db().insert(commerceActivity).values({
      id: row.id,
      tenantId: row.tenantId,
      connectionId: row.connectionId,
      actorUserId: row.actorUserId,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      detailJson: row.detail,
    });
  }

  async listActivity(tenantId: string, connectionId?: string) {
    const rows = await db()
      .select()
      .from(commerceActivity)
      .where(eq(commerceActivity.tenantId, tenantId))
      .orderBy(desc(commerceActivity.createdAt))
      .limit(100);
    return rows
      .filter((r) => !connectionId || r.connectionId === connectionId)
      .map(
        (row): ActivityRow => ({
          id: row.id,
          connectionId: row.connectionId,
          actorUserId: row.actorUserId,
          action: row.action,
          entity: row.entity,
          entityId: row.entityId,
          detail: (row.detailJson as Record<string, unknown> | null) ?? null,
          createdAt: row.createdAt.toISOString(),
        }),
      );
  }
}

function productFrom(row: typeof inventoryProducts.$inferSelect): ProductRecord {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    productType: row.productType,
    isActive: row.isActive === '1',
    archived: Boolean(row.voidedAt),
    sellPrice: String(row.sellPrice),
    revision: Math.floor(row.updatedAt.getTime() / 1000),
    parentProductId: row.parentProductId ?? null,
  };
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes(constraint) || msg.toLowerCase().includes('duplicate');
}

function eventFrom(row: typeof commerceOrderEvents.$inferSelect): CommerceEventRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    connectionId: row.connectionId,
    orderId: row.orderId,
    externalEventId: row.externalEventId,
    kind: row.kind,
    status: row.status,
    sourceVersion: row.sourceVersion,
    effectiveAt: row.effectiveAt.toISOString(),
    amount: row.amount,
    restock: isOn(row.restock),
    payload: (row.payloadJson as Record<string, unknown>) ?? {},
    result: (row.resultJson as Record<string, unknown> | null) ?? null,
  };
}

function refundFrom(row: typeof commerceRefunds.$inferSelect): CommerceRefundRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    connectionId: row.connectionId,
    orderId: row.orderId,
    externalRefundId: row.externalRefundId,
    amount: row.amount,
    restock: isOn(row.restock),
    documentId: row.documentId,
  };
}

function orderFrom(row: typeof commerceOrders.$inferSelect, lines: (typeof commerceOrderLines.$inferSelect)[]): OrderRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    connectionId: row.connectionId,
    externalId: row.externalId,
    status: row.status as OrderStatus,
    reviewReason: row.reviewReason,
    currency: row.currency,
    total: row.total,
    payloadHash: row.payloadHash,
    snapshot: row.snapshotJson as OrderInput,
    sourceVersion: row.sourceVersion,
    sourceTimezone: row.sourceTimezone,
    placedAt: row.placedAt.toISOString(),
    documentId: row.documentId,
    documentNumber: row.documentNumber,
    settlementAccountCode: row.settlementAccountCode ?? null,
    fulfilment: normalizeFulfilment(row.fulfilmentJson),
    lastAppliedVersion: row.lastAppliedVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: lines.map((line) => ({
      id: line.id,
      externalLineId: line.externalLineId,
      sku: line.sku,
      bookoneProductId: line.bookoneProductId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxAmount: line.taxAmount,
      discountAmount: line.discountAmount,
      restockedQty: line.restockedQty,
      refundedAmount: line.refundedAmount,
    })),
  };
}
