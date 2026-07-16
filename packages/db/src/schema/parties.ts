import { pgTable, uuid, varchar, timestamp, text, numeric, integer } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const parties = pgTable('parties', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 255 }).notNull(),
  kind: varchar('kind', { length: 20 }).notNull().default('customer'),
  code: varchar('code', { length: 40 }),
  phone: varchar('phone', { length: 30 }),
  email: varchar('email', { length: 320 }),
  address: varchar('address', { length: 500 }),
  taxId: varchar('tax_id', { length: 100 }),
  creditLimit: numeric('credit_limit', { precision: 18, scale: 2 }),
  paymentTermsDays: integer('payment_terms_days'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
