import { pgTable, uuid, varchar, timestamp, numeric, text } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { accounts } from './accounts';

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  accountingType: varchar('accounting_type', { length: 20 }).notNull(),
  direction: varchar('direction', { length: 20 }).notNull(),
  party: varchar('party', { length: 255 }).notNull(),
  description: varchar('description', { length: 1000 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 5 }).notNull().default('LKR'),
  paymentMethod: varchar('payment_method', { length: 20 }).notNull(),
  paymentAccountId: uuid('payment_account_id').notNull().references(() => accounts.id),
  transferSourceAccountId: uuid('transfer_source_account_id').references(() => accounts.id),
  date: varchar('date', { length: 10 }).notNull(),
  receiptRef: varchar('receipt_ref', { length: 500 }),
  categoryCode: varchar('category_code', { length: 20 }),
  categoryName: varchar('category_name', { length: 255 }),
  categoryConfidence: numeric('category_confidence', { precision: 3, scale: 2 }),
  categorySource: varchar('category_source', { length: 20 }),
  invoiceRef: varchar('invoice_ref', { length: 100 }),
  isAlreadySettled: varchar('is_already_settled', { length: 1 }).notNull().default('0'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
