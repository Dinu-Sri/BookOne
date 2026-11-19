import { integer, numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { parties } from './parties';
import { accounts } from './accounts';
import { transactions } from './transactions';
import { journalEntries } from './journal-entries';
import { businessDocuments } from './business-documents';

export const partyAdvances = pgTable('party_advances', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  partyId: uuid('party_id').notNull().references(() => parties.id),
  kind: varchar('kind', { length: 20 }).notNull(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  cashAccountId: uuid('cash_account_id').notNull().references(() => accounts.id),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  issuedAmount: numeric('issued_amount', { precision: 18, scale: 2 }).notNull(),
  appliedAmount: numeric('applied_amount', { precision: 18, scale: 2 }).notNull().default('0'),
  refundedAmount: numeric('refunded_amount', { precision: 18, scale: 2 }).notNull().default('0'),
  expenseSettledAmount: numeric('expense_settled_amount', { precision: 18, scale: 2 }).notNull().default('0'),
  returnedCashAmount: numeric('returned_cash_amount', { precision: 18, scale: 2 }).notNull().default('0'),
  sourceTransactionId: uuid('source_transaction_id').references(() => transactions.id),
  sourceJournalId: uuid('source_journal_id').references(() => journalEntries.id),
  issuedOn: varchar('issued_on', { length: 10 }).notNull(),
  notes: text('notes'),
  idempotencyKey: varchar('idempotency_key', { length: 80 }).notNull(),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const partyAdvanceAllocations = pgTable('party_advance_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  advanceId: uuid('advance_id').notNull().references(() => partyAdvances.id),
  kind: varchar('kind', { length: 20 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  documentId: uuid('document_id').references(() => businessDocuments.id),
  transactionId: uuid('transaction_id').references(() => transactions.id),
  journalId: uuid('journal_id').references(() => journalEntries.id),
  notes: text('notes'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
