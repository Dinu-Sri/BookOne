import { pgTable, uuid, varchar, timestamp, numeric, text, integer, jsonb, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { brands, locations } from './company-settings';
import { transactions } from './transactions';
import { parties } from './parties';

/**
 * product_type:
 * - physical (legacy: stocked) — qty tracked, COGS + inventory on sale
 * - digital — non-stock sellable (licenses etc.), no inventory asset
 * - service — labour/fees, no inventory asset
 * - rental — hire fleet; qty tracked, NO COGS on invoice
 */
export const inventoryProducts = pgTable('inventory_products', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  sku: varchar('sku', { length: 80 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  /** Short / card HTML — maps to WordPress short description later. */
  description: text('description'),
  /** Full HTML — maps to WordPress long description later. */
  longDescription: text('long_description'),
  productType: varchar('product_type', { length: 20 }).notNull().default('physical'),
  unit: varchar('unit', { length: 40 }).notNull().default('each'),
  unitCost: numeric('unit_cost', { precision: 18, scale: 2 }).notNull().default('0'),
  sellPrice: numeric('sell_price', { precision: 18, scale: 2 }).notNull().default('0'),
  revenueAccountCode: varchar('revenue_account_code', { length: 20 }).notNull().default('4000'),
  cogsAccountCode: varchar('cogs_account_code', { length: 20 }).notNull().default('5000'),
  inventoryAccountCode: varchar('inventory_account_code', { length: 20 }).notNull().default('5100'),
  expenseAccountCode: varchar('expense_account_code', { length: 20 }).notNull().default('6800'),
  category: varchar('category', { length: 120 }),
  categoryId: uuid('category_id').references((): AnyPgColumn => inventoryProductCategories.id),
  /** Company brand this SKU belongs to. Null = all brands / shared. */
  brandId: uuid('brand_id').references(() => brands.id),
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
  /** event | day | hour — used when productType = rental */
  hireUnit: varchar('hire_unit', { length: 20 }),
  /** Hours after return before this SKU is bookable; null = tenant default */
  turnaroundHours: varchar('turnaround_hours', { length: 10 }),
  depositAmount: numeric('deposit_amount', { precision: 18, scale: 2 }),
  replacementPrice: numeric('replacement_price', { precision: 18, scale: 2 }),
  /** 1 = hire units identified by serial (tents, generators) */
  tracksSerials: varchar('tracks_serials', { length: 1 }).notNull().default('0'),
  isActive: varchar('is_active', { length: 1 }).notNull().default('1'),
  // --- Catalog (Commerce WP1) -------------------------------------------
  /** Shorter display name for cards and carts. */
  shortName: varchar('short_name', { length: 120 }),
  /** Manufacturer / product brand (not the company's own trading brand). */
  productBrandId: uuid('product_brand_id').references((): AnyPgColumn => inventoryProductBrands.id),
  /** Variant: the parent "variable" product this SKU belongs to. */
  parentProductId: uuid('parent_product_id').references((): AnyPgColumn => inventoryProducts.id),
  /** Variant option values, e.g. [{"name":"Colour","value":"Lemon Yellow"}]. */
  variantOptions: jsonb('variant_options').notNull().default([]),
  /** Parent only: option names and values, e.g. [{"name":"Colour","values":["…"]}]. */
  productOptions: jsonb('product_options').notNull().default([]),
  swatchHex: varchar('swatch_hex', { length: 9 }),
  variantSortOrder: integer('variant_sort_order').notNull().default(0),
  isDefaultVariant: varchar('is_default_variant', { length: 1 }).notNull().default('0'),
  tags: jsonb('tags').notNull().default([]),
  extraBarcodes: jsonb('extra_barcodes').notNull().default([]),
  /** [{"code":"volume_ml","value":"8"}] against inventory_attributes. */
  attributeValues: jsonb('attribute_values').notNull().default([]),
  weightGrams: integer('weight_grams'),
  lengthMm: integer('length_mm'),
  widthMm: integer('width_mm'),
  heightMm: integer('height_mm'),
  fragile: varchar('fragile', { length: 1 }).notNull().default('0'),
  minOrderQty: numeric('min_order_qty', { precision: 18, scale: 4 }),
  maxOrderQty: numeric('max_order_qty', { precision: 18, scale: 4 }),
  orderQtyStep: numeric('order_qty_step', { precision: 18, scale: 4 }),
  allowBackorder: varchar('allow_backorder', { length: 1 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

/** Manufacturer / product brands shown on websites (Winsor & Newton, Faber-Castell…). */
export const inventoryProductBrands = pgTable('inventory_product_brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 120 }).notNull(),
  slug: varchar('slug', { length: 120 }),
  description: text('description'),
  websiteUrl: varchar('website_url', { length: 300 }),
  logoKey: varchar('logo_key', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

/** Product gallery images (originals kept, long side ≤ 2000 px). */
export const inventoryProductImages = pgTable('inventory_product_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  productId: uuid('product_id').notNull().references(() => inventoryProducts.id),
  storageKey: varchar('storage_key', { length: 500 }).notNull(),
  contentType: varchar('content_type', { length: 40 }).notNull().default('image/webp'),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  alt: varchar('alt', { length: 255 }),
  position: integer('position').notNull().default(0),
  checksum: varchar('checksum', { length: 80 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

/** Attribute definitions for filters and spec tables (code is stable). */
export const inventoryAttributes = pgTable('inventory_attributes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  code: varchar('code', { length: 60 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  type: varchar('type', { length: 20 }).notNull().default('text'),
  unit: varchar('unit', { length: 20 }),
  allowedValues: jsonb('allowed_values').notNull().default([]),
  filterable: varchar('filterable', { length: 1 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

/** Tenant product categories (POS filters + product form picker + later WordPress tree). */
export const inventoryProductCategories = pgTable('inventory_product_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 120 }).notNull(),
  slug: varchar('slug', { length: 80 }),
  parentId: uuid('parent_id').references((): AnyPgColumn => inventoryProductCategories.id),
  brandId: uuid('brand_id').references(() => brands.id),
  locationId: uuid('location_id').references(() => locations.id),
  sortOrder: integer('sort_order').notNull().default(0),
  description: text('description'),
  imageKey: varchar('image_key', { length: 500 }),
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

export const inventoryCostLayers = pgTable('inventory_cost_layers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  productId: uuid('product_id')
    .notNull()
    .references(() => inventoryProducts.id),
  locationId: uuid('location_id').references(() => locations.id),
  qtyReceived: numeric('qty_received', { precision: 18, scale: 4 }).notNull(),
  qtyRemaining: numeric('qty_remaining', { precision: 18, scale: 4 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 18, scale: 2 }).notNull().default('0'),
  receivedOn: varchar('received_on', { length: 10 }).notNull(),
  sourceType: varchar('source_type', { length: 40 }),
  sourceId: uuid('source_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const inventoryCostLayerConsumptions = pgTable('inventory_cost_layer_consumptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  layerId: uuid('layer_id')
    .notNull()
    .references(() => inventoryCostLayers.id),
  productId: uuid('product_id')
    .notNull()
    .references(() => inventoryProducts.id),
  qty: numeric('qty', { precision: 18, scale: 4 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 18, scale: 2 }).notNull().default('0'),
  sourceType: varchar('source_type', { length: 40 }),
  sourceId: uuid('source_id'),
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
