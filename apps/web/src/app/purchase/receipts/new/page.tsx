import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewGoodsReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const sp = await searchParams;
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData('vendor')]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Goods Received" tenant={tenant}>
      <CommercialDocNewForm
        backHref="/purchase/receipts"
        backLabel="Goods received"
        documentType="goods_receipt"
        partyLabel="Vendor"
        partyPlaceholder="Vendor name"
        products={form.products}
        partyOptions={form.partyOptions}
        showPurchaseExtras
        sourceDocumentId={sp.from ?? null}
        submitLabel="Save GRN"
        banner="Stocks physical items · no GL until billed"
      />
    </BookOneShell>
  );
}
