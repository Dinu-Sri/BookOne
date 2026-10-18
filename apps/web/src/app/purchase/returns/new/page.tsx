import { redirect } from 'next/navigation';
import {
  hydrateDraftLineState,
  linkedReturnPrefillQuantities,
  remainingReturnValue,
} from '@bookone/accounting';
import { getCommercialDocument, loadInvoiceForReturn } from '@/app/actions/commercial-docs';
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
  let returnSource = null as Awaited<ReturnType<typeof loadInvoiceForReturn>>;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData('vendor')]);
    if (sp.from) {
      [source, returnSource] = await Promise.all([
        getCommercialDocument(sp.from),
        loadInvoiceForReturn(sp.from),
      ]);
    }
  } catch {
    redirect('/login');
  }

  const sourceQtyLines = source
    ? source.lines.map((l) => ({
        productId: l.productId,
        description: l.description,
        quantity: Number(l.quantity),
      }))
    : [];
  const priorReturnLines = returnSource?.priorReturnLines ?? [];
  const prefill = source
    ? linkedReturnPrefillQuantities(sourceQtyLines, priorReturnLines)
    : [];
  const remainingQuantity = prefill.reduce((s, p) => s + p.remainingQuantity, 0);
  const remainingValue = remainingReturnValue(
    returnSource?.sourceNet ?? source?.subtotal ?? 0,
    returnSource?.alreadyReturnedNet ?? 0,
  );

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
        sourceDocumentId={source?.id ?? null}
        sourceDocumentNumber={source?.documentNumber ?? null}
        remainingQuantity={source ? remainingQuantity : undefined}
        remainingValue={source ? remainingValue : undefined}
        initialHeaderDiscount={source?.discountTotal ?? 0}
        initialPartyName={source?.partyName ?? returnSource?.partyName ?? null}
        sourceTotal={returnSource?.sourceNet ?? source?.subtotal ?? 0}
        sourceVatRate={returnSource?.vatRate ?? 0}
        alreadyReturnedTotal={returnSource?.alreadyReturnedNet ?? 0}
        priorReturnLines={priorReturnLines}
        sourceQtyLines={sourceQtyLines}
        initialLines={
          source
            ? source.lines.map((l, i) => {
                const remaining = prefill[i]?.remainingQuantity ?? 0;
                const hydrated = hydrateDraftLineState({
                  id: l.id,
                  productId: l.productId,
                  description: l.description,
                  quantity: remaining,
                  unitPrice: l.unitPrice,
                  discountAmount: l.discountAmount,
                  discountPercent: l.discountPercent,
                  sku: l.sku,
                  productClass: l.productClass,
                });
                return {
                  ...hydrated,
                  sourceQuantity: String(l.quantity),
                  sourceDiscountAmount: String(l.discountAmount ?? 0),
                };
              })
            : undefined
        }
        banner="Reduces AP / stock for physical items"
      />
    </BookOneShell>
  );
}
