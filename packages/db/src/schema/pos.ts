import { pgTable, uuid, varchar, timestamp, numeric, text, integer } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { locations } from './company-settings';

export const posRegisters = pgTable('pos_registers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  code: varchar('code', { length: 40 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  locationId: uuid('location_id').references(() => locations.id),
  /** browser | thermal | both */
  printMode: varchar('print_mode', { length: 20 }).notNull().default('browser'),
  thermalDeviceHint: varchar('thermal_device_hint', { length: 255 }),
  receiptFooter: text('receipt_footer'),
  defaultPaymentAccountCode: varchar('default_payment_account_code', { length: 20 }).notNull().default('1000'),
  isActive: varchar('is_active', { length: 1 }).notNull().default('1'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const posShifts = pgTable('pos_shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  registerId: uuid('register_id').notNull().references(() => posRegisters.id),
  openedBy: uuid('opened_by').notNull().references(() => users.id),
  closedBy: uuid('closed_by').references(() => users.id),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  openingFloat: numeric('opening_float', { precision: 18, scale: 2 }).notNull().default('0'),
  closingCashCount: numeric('closing_cash_count', { precision: 18, scale: 2 }),
  expectedCash: numeric('expected_cash', { precision: 18, scale: 2 }),
  varianceCash: numeric('variance_cash', { precision: 18, scale: 2 }),
  notes: text('notes'),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
