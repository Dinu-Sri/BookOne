import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/** Tenant-level Purchase / AP controls (P3). */
export const purchaseSettings = pgTable('purchase_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id)
    .unique(),
  /** Bills post to GL only after Approve */
  requireBillApproval: varchar('require_bill_approval', { length: 1 }).notNull().default('0'),
  /** Supplier invoice # required on credit bills */
  requireSupplierInvoiceNo: varchar('require_supplier_invoice_no', { length: 1 }).notNull().default('0'),
  /** Block create when same vendor + supplier inv # (+ amount) exists */
  blockDuplicateBills: varchar('block_duplicate_bills', { length: 1 }).notNull().default('1'),
  /** Prefer GRN before billing physical goods from a PO */
  requireGrnBeforeBill: varchar('require_grn_before_bill', { length: 1 }).notNull().default('0'),
  defaultPaymentTerms: varchar('default_payment_terms', { length: 40 }).notNull().default('Net 30'),
  defaultExpenseAccount: varchar('default_expense_account', { length: 20 }).notNull().default('6800'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
