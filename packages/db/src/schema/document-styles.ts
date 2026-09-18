import { pgTable, uuid, varchar, timestamp, text, integer } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { brands } from './company-settings';

/** Print themes for quotes, invoices, tax invoices, receipts. */
export const documentStyles = pgTable('document_styles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: varchar('name', { length: 120 }).notNull(),
  /** quotation | invoice | tax_invoice | receipt */
  docKind: varchar('doc_kind', { length: 30 }).notNull(),
  brandId: uuid('brand_id').references(() => brands.id),
  isActive: varchar('is_active', { length: 1 }).notNull().default('0'),
  version: integer('version').notNull().default(1),
  accentColor: varchar('accent_color', { length: 20 }).notNull().default('#1e3a8a'),
  logoImageKey: varchar('logo_image_key', { length: 500 }),
  logoPosition: varchar('logo_position', { length: 20 }).notNull().default('left'),
  showSku: varchar('show_sku', { length: 1 }).notNull().default('1'),
  showTin: varchar('show_tin', { length: 1 }).notNull().default('1'),
  showPhone: varchar('show_phone', { length: 1 }).notNull().default('1'),
  showEmail: varchar('show_email', { length: 1 }).notNull().default('1'),
  showBank: varchar('show_bank', { length: 1 }).notNull().default('0'),
  bankDetails: text('bank_details'),
  footerNotes: text('footer_notes'),
  fontFamily: varchar('font_family', { length: 80 }).notNull().default('Arial, Helvetica, sans-serif'),
  showQr: varchar('show_qr', { length: 1 }).notNull().default('0'),
  typeScale: varchar('type_scale', { length: 40 }).notNull().default('major_second'),
  baseFontPx: integer('base_font_px').notNull().default(11),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
