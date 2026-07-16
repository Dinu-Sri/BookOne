import { pgTable, uuid, varchar, timestamp, numeric, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { locations } from './company-settings';
import { transactions } from './transactions';
import { parties } from './parties';

/**
 * product_type:
 * - physical (legacy: stocked) — qty tracked, COGS + inventory on sale
 * - digital — non-stock sellable (licenses etc.), no inventory asset
 * - service — labour/fees, no inventory asset
 */
export const inventoryProducts = pgTable('inventory_products', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  sku: varchar('sku', { length: 80 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  productType: varchar('product_type', { length: 20 }).notNull().default('physical'),
  unit: varchar('unit', { length: 40 }).notNull().default('ea'),
  unitCost: numeric('unit_cost', { precision: 18, scale: 2 }).notNull().default('0'),
  sellPrice: numeric('sell_price', { precision: 18, scale: 2 }).notNull().default('0'),
  revenueAccountCode: varchar('revenue_account_code', { length: 20 }).notNull().default('4000'),
  cogsAccountCode: varchar('cogs_account_code', { length: 20 }).notNull().default('5000'),
  inventoryAccountCode: varchar('inventory_account_code', { length: 20 }).notNull().default('5100'),
  expenseAccountCode: varchar('expense_account_code', { length: 20 }).notNull().default('6800'),
  category: varchar('category', { length: 120 }),
  barcode: varchar('barcode', { length: 80 }),
  sellable: varchar('sellable', { length: 1 }).notNull().default('1'),
  purchasable: varchar('purchasable', { length: 1 }).notNull().default('1'),
  taxStatus: varchar('tax_status', { length: 20 }).notNull().default('unknown'),
  reorderLevel: numeric('reorder_level', { precision: 18, scale: 4 }),
  reorderQty: numeric('reorder_qty', { precision: 18, scale: 4 }),
  preferredVendorId: uuid('preferred_vendor_id').references(() => parties.id),
  notes: text('notes'),
  /** S3 key or public path (/products/...) for 400x400 WebP product photo */
  imageKey: varchar('image_key', { length: 500 }),
  isActive: varchar('is_active', { length: 1 }).notNull().default('1'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const inventoryStockLevels = pgTable(
  'inventory_stock_levels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    productId: uuid('product_id').notNull().references(() => inventoryProducts.id),
    locationId: uuid('location_id').references(() => locations.id),
    qtyOnHand: numeric('qty_on_hand', { precision: 18, scale: 4 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    productLocationUnique: uniqueIndex('inventory_stock_levels_product_location_uidx').on(
      table.tenantId,
      table.productId,
      table.locationId,
    ),
  }),
);

export const inventoryStockDocs = pgTable('inventory_stock_docs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  docType: varchar('doc_type', { length: 20 }).notNull(),
  documentNumber: varchar('document_number', { length: 50 }).notNull(),
  docDate: varchar('doc_date', { length: 10 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('posted'),
  fromLocationId: uuid('from_location_id').references(() => locations.id),
  toLocationId: uuid('to_location_id').references(() => locations.id),
  reason: varchar('reason', { length: 255 }),
  notes: text('notes'),
  transactionId: uuid('transaction_id').references(() => transactions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const inventoryStockDocLines = pgTable('inventory_stock_doc_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  stockDocId: uuid('stock_doc_id').notNull().references(() => inventoryStockDocs.id),
  productId: uuid('product_id').notNull().references(() => inventoryProducts.id),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 18, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  movementType: varchar('movement_type', { length: 20 }).notNull(),
  productId: uuid('product_id').notNull().references(() => inventoryProducts.id),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 18, scale: 2 }).notNull().default('0'),
  fromLocationId: uuid('from_location_id').references(() => locations.id),
  toLocationId: uuid('to_location_id').references(() => locations.id),
  referenceType: varchar('reference_type', { length: 40 }),
  referenceId: uuid('reference_id'),
  transactionId: uuid('transaction_id').references(() => transactions.id),
  memo: varchar('memo', { length: 500 }),
  movementDate: varchar('movement_date', { length: 10 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
