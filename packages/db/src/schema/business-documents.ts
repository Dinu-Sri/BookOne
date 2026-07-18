import { pgTable, uuid, varchar, timestamp, numeric, text, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { parties } from './parties';
import { transactions } from './transactions';
import { accounts } from './accounts';
import { brands, locations } from './company-settings';
import { inventoryProducts } from './inventory';
import { salesDiscounts } from './sales-discounts';

/**
 * Commercial documents across Sales + Purchase.
 * Types: quotation | sales_order | sales_invoice | sales_return | pos_sale
 *        | purchase_order | purchase | import_purchase | purchase_return | cash_purchase
 * Legacy: customer_invoice, vendor_bill
 */
export const businessDocuments = pgTable('business_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  partyId: uuid('party_id').notNull().references(() => parties.id),
  transactionId: uuid('transaction_id').references(() => transactions.id),
  documentType: varchar('document_type', { length: 30 }).notNull(),
  documentNumber: varchar('document_number', { length: 50 }).notNull(),
  issueDate: varchar('issue_date', { length: 10 }).notNull(),
  dueDate: varchar('due_date', { length: 10 }),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  sourceDocumentId: uuid('source_document_id').references((): AnyPgColumn => businessDocuments.id),
  discountId: uuid('discount_id').references(() => salesDiscounts.id),
  discountTotal: numeric('discount_total', { precision: 18, scale: 2 }).notNull().default('0'),
  brandId: uuid('brand_id').references(() => brands.id),
  locationId: uuid('location_id').references(() => locations.id),
  subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull(),
  taxTotal: numeric('tax_total', { precision: 18, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 18, scale: 2 }).notNull(),
  paidAmount: numeric('paid_amount', { precision: 18, scale: 2 }).notNull().default('0'),
  balanceDue: numeric('balance_due', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 5 }).notNull().default('LKR'),
  notes: text('notes'),
  saleChannel: varchar('sale_channel', { length: 20 }).notNull().default('local'),
  invoiceKind: varchar('invoice_kind', { length: 20 }).notNull().default('commercial'),
  deliveryDate: varchar('delivery_date', { length: 10 }),
  placeOfSupply: varchar('place_of_supply', { length: 255 }),
  paymentMode: varchar('payment_mode', { length: 40 }),
  taxInvoiceNumber: varchar('tax_invoice_number', { length: 80 }),
  /** Vendor's invoice / bill number (AP matching / duplicate guard) */
  supplierInvoiceNumber: varchar('supplier_invoice_number', { length: 80 }),
  exportCountry: varchar('export_country', { length: 100 }),
  exportRef: varchar('export_ref', { length: 120 }),
  additionalInfo: text('additional_info'),
  vatRate: numeric('vat_rate', { precision: 8, scale: 2 }).notNull().default('0'),
  amountInWords: text('amount_in_words'),
  purchaserTin: varchar('purchaser_tin', { length: 50 }),
  purchaserPhone: varchar('purchaser_phone', { length: 40 }),
  purchaserAddress: varchar('purchaser_address', { length: 500 }),
  registerId: uuid('register_id'),
  shiftId: uuid('shift_id'),
  /** sale | return when created from POS */
  posMode: varchar('pos_mode', { length: 20 }),
  sourcePosSaleId: uuid('source_pos_sale_id'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const businessDocumentLines = pgTable('business_document_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  documentId: uuid('document_id').notNull().references(() => businessDocuments.id),
  productId: uuid('product_id').references(() => inventoryProducts.id),
  accountId: uuid('account_id').references(() => accounts.id),
  lineRef: varchar('line_ref', { length: 80 }),
  description: varchar('description', { length: 1000 }).notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull().default('1'),
  unitPrice: numeric('unit_price', { precision: 18, scale: 2 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 18, scale: 2 }).notNull().default('0'),
  discountPercent: numeric('discount_percent', { precision: 8, scale: 2 }).notNull().default('0'),
  discountAmount: numeric('discount_amount', { precision: 18, scale: 2 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
