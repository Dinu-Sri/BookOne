import { pgTable, uuid, varchar, timestamp, numeric, text } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const salesDiscounts = pgTable('sales_discounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 40 }),
  discountType: varchar('discount_type', { length: 20 }).notNull().default('percent'), // percent | fixed
  value: numeric('value', { precision: 18, scale: 2 }).notNull(),
  isActive: varchar('is_active', { length: 1 }).notNull().default('1'),
  startsOn: varchar('starts_on', { length: 10 }),
  endsOn: varchar('ends_on', { length: 10 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
