import { redirect } from 'next/navigation';
import { getCommercialDocument } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewPurchaseReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const sp = await searchParams;
  let tenant;
  let form;
  let source = null as Awaited<ReturnType<typeof getCommercialDocument>>;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData('vendor')]);
    if (sp.from) source = await getCommercialDocument(sp.from);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Purchase Returns" tenant={tenant}>
      <CommercialDocNewForm
        backHref="/purchase/returns"
        backLabel="Purchase returns"
        documentType="purchase_return"
        partyLabel="Vendor"
        partyPlaceholder="Vendor name"
        products={form.products}
        partyOptions={form.partyOptions}
        showExpenseAccount
        showPurchaseExtras
        expenseAccounts={form.expenseAccounts}
        brands={form.brands}
          locations={form.locations}
        submitLabel="Save purchase return"
        sourceDocumentId={sp.from ?? null}
        initialHeaderDiscount={source?.discountTotal ?? 0}
        initialLines={
          source
            ? source.lines.map((l) => ({
                key: l.id,
                productId: l.productId ?? '',
                description: l.description,
                quantity: String(l.quantity),
                unitPrice: String(l.unitPrice),
                discountType: l.discountAmount > 0 ? ('fixed' as const) : ('percent' as const),
                discountValue: l.discountAmount > 0 ? String(l.discountAmount) : '',
                isManual: !l.productId,
              }))
            : undefined
        }
        banner="Reduces AP / stock for physical items"
      />
    </BookOneShell>
  );
}
