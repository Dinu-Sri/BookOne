import { numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { accounts } from './accounts';
import { transactions } from './transactions';
import { journalEntries } from './journal-entries';

export const openingBalanceRuns = pgTable('opening_balance_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  effectiveDate: varchar('effective_date', { length: 10 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('preview'),
  fingerprint: varchar('fingerprint', { length: 2000 }).notNull(),
  debitTotal: numeric('debit_total', { precision: 18, scale: 2 }).notNull().default('0'),
  creditTotal: numeric('credit_total', { precision: 18, scale: 2 }).notNull().default('0'),
  sourceTransactionId: uuid('source_transaction_id').references(() => transactions.id),
  sourceJournalId: uuid('source_journal_id').references(() => journalEntries.id),
  notes: text('notes'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const openingBalanceLines = pgTable('opening_balance_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  runId: uuid('run_id').notNull().references(() => openingBalanceRuns.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  debit: numeric('debit', { precision: 18, scale: 2 }).notNull().default('0'),
  credit: numeric('credit', { precision: 18, scale: 2 }).notNull().default('0'),
});
