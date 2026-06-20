import { pgTable, uuid, varchar, timestamp, numeric, text } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { parties } from './parties';
import { transactions } from './transactions';
import { accounts } from './accounts';

export const businessDocuments = pgTable('business_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  partyId: uuid('party_id').notNull().references(() => parties.id),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id),
  documentType: varchar('document_type', { length: 20 }).notNull(),
  documentNumber: varchar('document_number', { length: 50 }).notNull(),
  issueDate: varchar('issue_date', { length: 10 }).notNull(),
  dueDate: varchar('due_date', { length: 10 }),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull(),
  taxTotal: numeric('tax_total', { precision: 18, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 18, scale: 2 }).notNull(),
  paidAmount: numeric('paid_amount', { precision: 18, scale: 2 }).notNull().default('0'),
  balanceDue: numeric('balance_due', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 5 }).notNull().default('LKR'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const businessDocumentLines = pgTable('business_document_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  documentId: uuid('document_id').notNull().references(() => businessDocuments.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  description: varchar('description', { length: 1000 }).notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 2 }).notNull().default('1'),
  unitPrice: numeric('unit_price', { precision: 18, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
