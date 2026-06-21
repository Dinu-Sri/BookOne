import { pgTable, uuid, varchar, timestamp, numeric } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { accounts } from './accounts';
import { journalEntries } from './journal-entries';
import { brands, locations } from './company-settings';

export const journalLines = pgTable('journal_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  journalEntryId: uuid('journal_entry_id').notNull().references(() => journalEntries.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  brandId: uuid('brand_id').references(() => brands.id),
  locationId: uuid('location_id').references(() => locations.id),
  side: varchar('side', { length: 10 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  memo: varchar('memo', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
