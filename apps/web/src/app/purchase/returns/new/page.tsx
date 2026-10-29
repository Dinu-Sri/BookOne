import { redirect } from 'next/navigation';
import { linkedReturnPickerFormStateFromSource } from '@bookone/accounting';
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

  const picker = linkedReturnPickerFormStateFromSource(
    source
      ? {
          id: source.id,
          documentNumber: source.documentNumber,
          partyName: source.partyName ?? returnSource?.partyName ?? '',
          headerDiscount: source.discountTotal,
          sourceNet: returnSource?.sourceNet ?? source.subtotal,
          alreadyReturnedNet: returnSource?.alreadyReturnedNet ?? 0,
          lines: source.lines,
          priorReturnLines: returnSource?.priorReturnLines ?? [],
        }
      : null,
  );
  const sourceQtyLines = source
    ? source.lines.map((l) => ({
        productId: l.productId,
        description: l.description,
        quantity: Number(l.quantity),
      }))
    : [];

  return (
    <BookOneShell active="Purchase Returns" tenant={tenant}>
      <CommercialDocNewForm
        key={picker.sourceDocumentId ?? 'new'}
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
        showPaymentAccount={source?.documentType === 'cash_purchase'}
        paymentAccounts={form.paymentAccounts}
        defaultPaymentCode={source?.documentType === 'cash_purchase' ? '1000' : undefined}
        submitLabel="Save purchase return"
        sourceDocumentId={picker.sourceDocumentId}
        sourceDocumentNumber={picker.sourceDocumentNumber}
        remainingQuantity={source ? picker.remainingQuantity : undefined}
        remainingValue={source ? picker.remainingValue : undefined}
        initialHeaderDiscount={picker.headerDiscount}
        initialPartyName={picker.partyName}
        sourceTotal={returnSource?.sourceNet ?? source?.subtotal ?? 0}
        sourceVatRate={returnSource?.vatRate ?? 0}
        alreadyReturnedTotal={returnSource?.alreadyReturnedNet ?? 0}
        priorReturnLines={returnSource?.priorReturnLines ?? []}
        sourceQtyLines={sourceQtyLines}
        initialLines={
          source
            ? picker.lines.map((l, i) => ({
                key: source.lines[i]?.id ?? `src-${i}`,
                productId: l.productId,
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                discountType: l.discountType,
                discountValue: l.discountValue,
                sourceQuantity: l.sourceQuantity,
                sourceDiscountAmount: l.sourceDiscountAmount,
                sku: l.sku,
                productClass: l.productClass,
                isManual: !l.productId,
              }))
            : undefined
        }
        banner={
          source?.documentType === 'cash_purchase'
            ? 'Refunds cash for a cash purchase · reverses stock or expense · original payment stays on the purchase'
            : 'Reduces AP / stock for physical items'
        }
      />
    </BookOneShell>
  );
}
