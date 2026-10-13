import { businessDocuments, sql } from '@bookone/db';

/** Invoice-like documents that create customer AR when posted. */
export const AR_BALANCE_TYPES = [
  'sales_invoice',
  'customer_invoice',
  'pos_sale',
  'sales_return',
] as const;

/** Bill-like documents that create vendor AP when posted. Purchase orders are commitments, not payables. */
export const AP_BALANCE_TYPES = [
  'vendor_bill',
  'purchase',
  'import_purchase',
  'purchase_return',
] as const;

/**
 * Posted collectible / payable rows.
 * Drafts and never-posted documents do not create AR/AP.
 * Archiving a posted unpaid document does not erase the debt.
 */
export function postedObligationSql() {
  return sql`${businessDocuments.postedAt} is not null and ${businessDocuments.status} not in ('draft', 'void', 'rejected', 'pending_approval')`;
}
