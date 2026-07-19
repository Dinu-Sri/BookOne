import { pgTable, uuid, varchar, timestamp, numeric, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { businessDocuments } from './business-documents';

export const salesSettings = pgTable('sales_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id).unique(),
  vatRatePercent: numeric('vat_rate_percent', { precision: 8, scale: 2 }).notNull().default('18'),
  exportVatRatePercent: numeric('export_vat_rate_percent', { precision: 8, scale: 2 }).notNull().default('0'),
  vatRegistered: varchar('vat_registered', { length: 1 }).notNull().default('0'),
  taxInvoiceDeptCode: varchar('tax_invoice_dept_code', { length: 40 }).notNull().default('01'),
  taxInvoiceSerialReset: varchar('tax_invoice_serial_reset', { length: 20 }).notNull().default('monthly'),
  defaultSaleChannel: varchar('default_sale_channel', { length: 20 }).notNull().default('local'),
  defaultInvoiceKind: varchar('default_invoice_kind', { length: 20 }).notNull().default('commercial'),
  /** When '1', block sales invoices that would exceed party creditLimit */
  enforceCreditLimit: varchar('enforce_credit_limit', { length: 1 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const taxInvoiceSequences = pgTable(
  'tax_invoice_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    yearYy: varchar('year_yy', { length: 2 }).notNull(),
    monthMmm: varchar('month_mmm', { length: 3 }).notNull(),
    deptCode: varchar('dept_code', { length: 40 }).notNull(),
    lastSerial: integer('last_serial').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uq: uniqueIndex('tax_invoice_sequences_uq').on(t.tenantId, t.yearYy, t.monthMmm, t.deptCode),
  }),
);

export const salesInvoiceSources = pgTable(
  'sales_invoice_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    invoiceId: uuid('invoice_id').notNull().references(() => businessDocuments.id),
    salesOrderId: uuid('sales_order_id').notNull().references(() => businessDocuments.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uq: uniqueIndex('sales_invoice_sources_uq').on(t.invoiceId, t.salesOrderId),
  }),
);
