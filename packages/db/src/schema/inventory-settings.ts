import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/** Tenant-level inventory costing and stock controls (P2). */
export const inventorySettings = pgTable('inventory_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id)
    .unique(),
  /** allow | block — block prevents stock movements that would drive qty negative */
  negativeStockPolicy: varchar('negative_stock_policy', { length: 10 }).notNull().default('allow'),
  /** last | average — how product.unitCost updates on purchase/GRN */
  costingMethod: varchar('costing_method', { length: 20 }).notNull().default('last'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
