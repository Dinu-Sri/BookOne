import { pgTable, uuid, varchar, timestamp, numeric, integer, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { businessDocuments, businessDocumentLines } from './business-documents';
import { inventoryProducts } from './inventory';
import { locations } from './company-settings';

/** Event header on a sales quote / order / invoice. */
export const rentalEvents = pgTable(
  'rental_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    documentId: uuid('document_id').notNull().references(() => businessDocuments.id),
    eventDate: varchar('event_date', { length: 10 }),
    hireFrom: varchar('hire_from', { length: 10 }).notNull(),
    hireTo: varchar('hire_to', { length: 10 }).notNull(),
    venue: varchar('venue', { length: 255 }),
    guestCount: integer('guest_count'),
    deliverAt: varchar('deliver_at', { length: 10 }),
    collectAt: varchar('collect_at', { length: 10 }),
    packingNotes: text('packing_notes'),
    depositHeld: numeric('deposit_held', { precision: 18, scale: 2 }).notNull().default('0'),
    depositApplied: numeric('deposit_applied', { precision: 18, scale: 2 }).notNull().default('0'),
    depositRefunded: numeric('deposit_refunded', { precision: 18, scale: 2 }).notNull().default('0'),
    overlapOverrideReason: varchar('overlap_override_reason', { length: 500 }),
    overlapOverriddenBy: uuid('overlap_overridden_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
  },
  (t) => ({
    documentUq: uniqueIndex('rental_events_document_uidx').on(t.tenantId, t.documentId),
  }),
);

/** Qty reserved/out for a hire SKU on a document line. */
export const rentalBookingLines = pgTable('rental_booking_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  documentId: uuid('document_id').notNull().references(() => businessDocuments.id),
  documentLineId: uuid('document_line_id').references(() => businessDocumentLines.id),
  productId: uuid('product_id').notNull().references(() => inventoryProducts.id),
  locationId: uuid('location_id').references(() => locations.id),
  qty: numeric('qty', { precision: 18, scale: 4 }).notNull(),
  hireFrom: varchar('hire_from', { length: 10 }).notNull(),
  hireTo: varchar('hire_to', { length: 10 }).notNull(),
  /** hold | reserved | dispatched | returned | cancelled */
  status: varchar('status', { length: 20 }).notNull().default('reserved'),
  dispatchedQty: numeric('dispatched_qty', { precision: 18, scale: 4 }).notNull().default('0'),
  returnedQty: numeric('returned_qty', { precision: 18, scale: 4 }).notNull().default('0'),
  damagedQty: numeric('damaged_qty', { precision: 18, scale: 4 }).notNull().default('0'),
  missingQty: numeric('missing_qty', { precision: 18, scale: 4 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
