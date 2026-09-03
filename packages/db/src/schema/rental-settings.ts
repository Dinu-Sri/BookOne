import { pgTable, uuid, varchar, timestamp, numeric, integer } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * Tenant rental / hire controls.
 * Flags enable which options this company uses; defaults apply to new bookings.
 * Products and bookings may still pick among the enabled options.
 */
export const rentalSettings = pgTable('rental_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id)
    .unique(),

  /** Hire rate units this company uses (a tenant may enable several). */
  allowHirePerEvent: varchar('allow_hire_per_event', { length: 1 }).notNull().default('1'),
  allowHirePerDay: varchar('allow_hire_per_day', { length: 1 }).notNull().default('1'),
  allowHirePerHour: varchar('allow_hire_per_hour', { length: 1 }).notNull().default('1'),
  /** event | day | hour — must be one of the enabled units */
  defaultHireUnit: varchar('default_hire_unit', { length: 20 }).notNull().default('event'),

  /** When hire invoices may be created. Several may be enabled; booking can override if allowed. */
  allowInvoiceOnConfirm: varchar('allow_invoice_on_confirm', { length: 1 }).notNull().default('1'),
  allowInvoiceOnDispatch: varchar('allow_invoice_on_dispatch', { length: 1 }).notNull().default('1'),
  allowInvoiceAfterReturn: varchar('allow_invoice_after_return', { length: 1 }).notNull().default('1'),
  allowInvoiceManual: varchar('allow_invoice_manual', { length: 1 }).notNull().default('1'),
  /** on_confirm | on_dispatch | after_return | manual */
  defaultInvoiceTiming: varchar('default_invoice_timing', { length: 20 }).notNull().default('on_confirm'),
  allowInvoiceTimingOverride: varchar('allow_invoice_timing_override', { length: 1 }).notNull().default('1'),

  /** Deposit collection: event-level, per hire line, or both. */
  allowDepositPerEvent: varchar('allow_deposit_per_event', { length: 1 }).notNull().default('1'),
  allowDepositPerItem: varchar('allow_deposit_per_item', { length: 1 }).notNull().default('1'),
  /** none | per_event | per_item | both */
  defaultDepositMode: varchar('default_deposit_mode', { length: 20 }).notNull().default('per_event'),
  defaultEventDepositAmount: numeric('default_event_deposit_amount', { precision: 18, scale: 2 })
    .notNull()
    .default('0'),
  defaultEventDepositPercent: numeric('default_event_deposit_percent', { precision: 8, scale: 2 })
    .notNull()
    .default('0'),

  /**
   * Overlapping bookings for the same qty:
   * block — nobody can confirm
   * warn — confirm after a warning
   * override — staff blocked; manager/admin may confirm with a reason
   * allow — no availability check
   */
  overlapPolicy: varchar('overlap_policy', { length: 20 }).notNull().default('override'),
  /** Hours after a return before the qty is bookable again (wash / transit). */
  defaultTurnaroundHours: integer('default_turnaround_hours').notNull().default(0),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
