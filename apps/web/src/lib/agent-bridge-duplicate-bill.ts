import { and, businessDocuments, db, eq, inArray, isNull, parties, sql, withTenantContext } from '@bookone/db';

/**
 * QA-1126-08: before approval, say when this supplier invoice number already has a
 * bill for the same supplier (legal or display name), so commit is not a silent refusal.
 */
export async function findDuplicateSupplierBill(
  tenantId: string,
  supplierName: string,
  supplierInvoiceNumber: string,
): Promise<{ documentNumber: string } | null> {
  const name = supplierName.trim();
  const inv = supplierInvoiceNumber.trim();
  if (!name || !inv) return null;
  return withTenantContext(tenantId, async () => {
    const [row] = await db()
      .select({ documentNumber: businessDocuments.documentNumber })
      .from(businessDocuments)
      .innerJoin(parties, eq(parties.id, businessDocuments.partyId))
      .where(
        and(
          eq(businessDocuments.tenantId, tenantId),
          eq(businessDocuments.supplierInvoiceNumber, inv),
          inArray(businessDocuments.documentType, ['purchase', 'import_purchase', 'vendor_bill']),
          isNull(businessDocuments.voidedAt),
          sql`(lower(${parties.name}) = lower(${name}) or lower(coalesce(${parties.displayName}, '')) = lower(${name}))`,
        ),
      )
      .limit(1);
    return row ? { documentNumber: row.documentNumber } : null;
  });
}

export function duplicateSupplierBillMessage(
  supplierName: string,
  supplierInvoiceNumber: string,
  documentNumber: string,
  blocked: boolean,
): string {
  const base = `A bill ${supplierInvoiceNumber} from ${supplierName} already exists (${documentNumber}).`;
  return blocked
    ? `${base} Purchase settings block duplicate bills, so committing this one will be refused. Reject it or correct the invoice number.`
    : `${base} Check it is not the same invoice before you approve.`;
}
