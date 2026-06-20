import { pgTable, uuid, varchar, timestamp, numeric, text, jsonb } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { transactions } from './transactions';

export const bankStatementImports = pgTable('bank_statement_imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  period: varchar('period', { length: 7 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  rowCount: numeric('row_count', { precision: 10, scale: 0 }).notNull().default('0'),
  matchedCount: numeric('matched_count', { precision: 10, scale: 0 }).notNull().default('0'),
  unmatchedCount: numeric('unmatched_count', { precision: 10, scale: 0 }).notNull().default('0'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const bankStatementLines = pgTable('bank_statement_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  importId: uuid('import_id').notNull().references(() => bankStatementImports.id),
  matchedTransactionId: uuid('matched_transaction_id').references(() => transactions.id),
  rowNumber: numeric('row_number', { precision: 10, scale: 0 }).notNull(),
  transactionDate: varchar('transaction_date', { length: 10 }).notNull(),
  description: varchar('description', { length: 1000 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('review'),
  raw: jsonb('raw'),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const periodLocks = pgTable('period_locks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  period: varchar('period', { length: 7 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('locked'),
  lockedAt: timestamp('locked_at', { withTimezone: true }).defaultNow().notNull(),
  unlockedAt: timestamp('unlocked_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
