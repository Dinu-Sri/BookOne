import { pgTable, uuid, varchar, timestamp, text, jsonb, bigint, primaryKey } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { locations } from './company-settings';
import { inventoryProducts } from './inventory';

export const commerceConnections = pgTable('commerce_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id),
  name: varchar('name', { length: 120 }).notNull(),
  kind: varchar('kind', { length: 40 }).notNull(),
  environment: varchar('environment', { length: 20 }).notNull(),
  locationId: uuid('location_id').references(() => locations.id),
  currency: varchar('currency', { length: 5 }).notNull().default('LKR'),
  postingMode: varchar('posting_mode', { length: 20 }).notNull().default('preview'),
  inboundPaused: varchar('inbound_paused', { length: 1 }).notNull().default('0'),
  outboundPaused: varchar('outbound_paused', { length: 1 }).notNull().default('0'),
  oversellPolicy: varchar('oversell_policy', { length: 20 }).notNull().default('review'),
  reservationMode: varchar('reservation_mode', { length: 20 }).notNull().default('disabled'),
  matchingPolicy: varchar('matching_policy', { length: 40 }).notNull().default('sku'),
  taxMode: varchar('tax_mode', { length: 40 }).notNull().default('domestic_inclusive'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  lastCatalogSyncAt: timestamp('last_catalog_sync_at', { withTimezone: true }),
  lastStockSyncAt: timestamp('last_stock_sync_at', { withTimezone: true }),
  lastOrderSyncAt: timestamp('last_order_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
});

export const commerceCredentials = pgTable('commerce_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => commerceConnections.id),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id),
  prefix: varchar('prefix', { length: 16 }).notNull(),
  secretHash: varchar('secret_hash', { length: 64 }).notNull(),
  scopes: text('scopes').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  rotatedFromId: uuid('rotated_from_id'),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const commerceProductMappings = pgTable('commerce_product_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => commerceConnections.id),
  bookoneProductId: uuid('bookone_product_id')
    .notNull()
    .references(() => inventoryProducts.id),
  sku: varchar('sku', { length: 80 }).notNull(),
  externalProductId: varchar('external_product_id', { length: 80 }).notNull(),
  externalVariantId: varchar('external_variant_id', { length: 80 }).notNull().default(''),
  status: varchar('status', { length: 20 }).notNull().default('mapped'),
  optedInFields: text('opted_in_fields').notNull().default('sku,name,unit'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const commerceOrders = pgTable('commerce_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => commerceConnections.id),
  externalId: varchar('external_id', { length: 80 }).notNull(),
  status: varchar('status', { length: 40 }).notNull(),
  reviewReason: text('review_reason'),
  currency: varchar('currency', { length: 5 }).notNull().default('LKR'),
  total: varchar('total', { length: 32 }).notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  snapshotJson: jsonb('snapshot_json').notNull(),
  sourceVersion: varchar('source_version', { length: 80 }),
  sourceTimezone: varchar('source_timezone', { length: 80 }),
  placedAt: timestamp('placed_at', { withTimezone: true }).notNull(),
  documentId: uuid('document_id'),
  documentNumber: varchar('document_number', { length: 50 }),
  lastEventId: uuid('last_event_id'),
  lastAppliedVersion: varchar('last_applied_version', { length: 80 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const commerceOrderLines = pgTable('commerce_order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  orderId: uuid('order_id')
    .notNull()
    .references(() => commerceOrders.id),
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => commerceConnections.id),
  externalLineId: varchar('external_line_id', { length: 80 }).notNull(),
  sku: varchar('sku', { length: 80 }).notNull(),
  bookoneProductId: uuid('bookone_product_id'),
  quantity: varchar('quantity', { length: 32 }).notNull(),
  unitPrice: varchar('unit_price', { length: 32 }).notNull(),
  taxAmount: varchar('tax_amount', { length: 32 }).notNull().default('0'),
  discountAmount: varchar('discount_amount', { length: 32 }).notNull().default('0'),
  restockedQty: varchar('restocked_qty', { length: 32 }).notNull().default('0'),
  refundedAmount: varchar('refunded_amount', { length: 32 }).notNull().default('0'),
});

export const commerceOrderEvents = pgTable('commerce_order_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => commerceConnections.id),
  orderId: uuid('order_id')
    .notNull()
    .references(() => commerceOrders.id),
  externalEventId: varchar('external_event_id', { length: 80 }).notNull(),
  kind: varchar('kind', { length: 40 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  sourceVersion: varchar('source_version', { length: 80 }),
  effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
  amount: varchar('amount', { length: 32 }),
  restock: varchar('restock', { length: 1 }).notNull().default('0'),
  payloadJson: jsonb('payload_json').notNull(),
  resultJson: jsonb('result_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const commerceRefunds = pgTable('commerce_refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => commerceConnections.id),
  orderId: uuid('order_id')
    .notNull()
    .references(() => commerceOrders.id),
  externalRefundId: varchar('external_refund_id', { length: 80 }).notNull(),
  amount: varchar('amount', { length: 32 }).notNull(),
  restock: varchar('restock', { length: 1 }).notNull().default('0'),
  documentId: uuid('document_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const commerceIdempotency = pgTable(
  'commerce_idempotency',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => commerceConnections.id),
    idempotencyKey: varchar('idempotency_key', { length: 80 }).notNull(),
    payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
    orderId: uuid('order_id'),
    receiptJson: jsonb('receipt_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.connectionId, t.idempotencyKey] }),
  }),
);

export const commerceOutbox = pgTable('commerce_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => commerceConnections.id),
  revision: bigint('revision', { mode: 'number' }).notNull(),
  kind: varchar('kind', { length: 40 }).notNull(),
  productId: uuid('product_id'),
  sku: varchar('sku', { length: 80 }),
  payloadJson: jsonb('payload_json').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const commerceCheckpoints = pgTable('commerce_checkpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => commerceConnections.id),
  kind: varchar('kind', { length: 40 }).notNull(),
  cursor: text('cursor'),
  lastRevision: bigint('last_revision', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const commerceActivity = pgTable('commerce_activity', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  connectionId: uuid('connection_id').references(() => commerceConnections.id),
  actorUserId: uuid('actor_user_id'),
  action: varchar('action', { length: 80 }).notNull(),
  entity: varchar('entity', { length: 80 }).notNull(),
  entityId: uuid('entity_id'),
  detailJson: jsonb('detail_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
