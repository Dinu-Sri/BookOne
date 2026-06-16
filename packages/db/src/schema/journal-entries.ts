import { pgTable, uuid, varchar, timestamp, text } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { transactions } from './transactions';

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id),
  memo: varchar('memo', { length: 1000 }).notNull(),
  entryDate: varchar('entry_date', { length: 10 }).notNull(),
  isBalanced: varchar('is_balanced', { length: 1 }).notNull().default('1'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
