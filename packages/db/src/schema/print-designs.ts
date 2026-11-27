import { pgTable, uuid, varchar, timestamp, text, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * Print designs (layouts for invoices, quotations, receipts…). One row per saved version.
 * Versions are never edited after saving: a change saves a new version in the same family.
 * Only a person approves a version and puts it in use; assistants save drafts.
 */
export const printDesigns = pgTable(
  'print_designs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** quotation | proforma_invoice | invoice | tax_invoice | receipt | credit_note | sales_order | packing_slip | pos_bill | purchase_order | payment_voucher */
    kind: varchar('kind', { length: 30 }).notNull(),
    /** All versions of one design share a family id (the first version's id). */
    familyId: uuid('family_id').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    version: integer('version').notNull().default(1),
    /** draft | awaiting_approval | approved | retired */
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    /** Validated design JSON (bookone.print-design.v1). */
    design: text('design').notNull(),
    /** What changed in this version, in the author's words. */
    changeNote: text('change_note'),
    /** person | assistant | system */
    createdVia: varchar('created_via', { length: 20 }).notNull().default('person'),
    createdByUserId: uuid('created_by_user_id'),
    /** For assistant versions: the connection and its label (e.g. "Claude"). */
    agentConnectionId: uuid('agent_connection_id'),
    agentLabel: varchar('agent_label', { length: 80 }),
    basedOnId: uuid('based_on_id'),
    approvalRequestedAt: timestamp('approval_requested_at', { withTimezone: true }),
    approvedByUserId: uuid('approved_by_user_id'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    /** '1' = the version printed for this kind now. At most one per company and kind. */
    inUse: varchar('in_use', { length: 1 }).notNull().default('0'),
    inUseFrom: timestamp('in_use_from', { withTimezone: true }),
    inUseUntil: timestamp('in_use_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    /** Deleted by a person in BookOne (never by an assistant). */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedByUserId: uuid('deleted_by_user_id'),
  },
  (t) => ({
    familyVersion: uniqueIndex('print_designs_family_version_uq').on(t.tenantId, t.familyId, t.version),
    byKind: index('print_designs_kind_idx').on(t.tenantId, t.kind),
  }),
);

/** Images used by print designs: the company logo, a signature and a stamp. */
export const printDesignAssets = pgTable('print_design_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  /** logo | signature | stamp */
  slot: varchar('slot', { length: 20 }).notNull(),
  imageKey: varchar('image_key', { length: 500 }).notNull(),
  uploadedByUserId: uuid('uploaded_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
