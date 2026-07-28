import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  numeric,
  text,
  jsonb,
  integer,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { transactions } from './transactions';
import { accounts } from './accounts';

export const bankStatementProfiles = pgTable('bank_statement_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  name: varchar('name', { length: 120 }).notNull(),
  bankHint: varchar('bank_hint', { length: 120 }),
  columnMap: jsonb('column_map').$type<Record<string, string | number>>().notNull().default({}),
  signConvention: varchar('sign_convention', { length: 40 }).notNull().default('signed_amount'),
  dateFormatHint: varchar('date_format_hint', { length: 40 }),
  skipRows: integer('skip_rows').notNull().default(0),
  sheetName: varchar('sheet_name', { length: 120 }),
  successCount: integer('success_count').notNull().default(0),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

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
  bankAccountId: uuid('bank_account_id').references(() => accounts.id),
  bookDomain: varchar('book_domain', { length: 20 }),
  fileSha256: varchar('file_sha256', { length: 64 }),
  storageKey: varchar('storage_key', { length: 500 }),
  periodFrom: varchar('period_from', { length: 10 }),
  periodTo: varchar('period_to', { length: 10 }),
  parserProfileId: uuid('parser_profile_id').references(() => bankStatementProfiles.id),
  source: varchar('source', { length: 20 }).default('erp_recon'),
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
  fingerprint: varchar('fingerprint', { length: 64 }),
  direction: varchar('direction', { length: 10 }),
  balanceAfter: numeric('balance_after', { precision: 18, scale: 2 }),
  externalRef: varchar('external_ref', { length: 100 }),
  matchScore: numeric('match_score', { precision: 5, scale: 4 }),
  matchMethod: varchar('match_method', { length: 20 }),
  matchCandidates: jsonb('match_candidates'),
  proposedAction: varchar('proposed_action', { length: 20 }).default('review'),
  createdTransactionId: uuid('created_transaction_id').references(() => transactions.id),
  confidence: numeric('confidence', { precision: 5, scale: 4 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const bankStatementImportEvents = pgTable('bank_statement_import_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  importId: uuid('import_id').notNull().references(() => bankStatementImports.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  lineId: uuid('line_id').references(() => bankStatementLines.id),
  action: varchar('action', { length: 40 }).notNull(),
  detail: jsonb('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
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
