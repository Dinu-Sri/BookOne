import { pgTable, uuid, varchar, timestamp, numeric } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { transactions } from './transactions';

export const settlementAllocations = pgTable('settlement_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  paymentTransactionId: uuid('payment_transaction_id').notNull().references(() => transactions.id),
  invoiceTransactionId: uuid('invoice_transaction_id').notNull().references(() => transactions.id),
  allocatedAmount: numeric('allocated_amount', { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
