import { redirect } from 'next/navigation';
import { getCommercialDocument } from '@/app/actions/commercial-docs';
import { getPurchaseSettings } from '@/app/actions/purchase-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentDetail } from '@/components/purchase/commercial-document-detail';

export default async function GoodsReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let tenant;
  let doc;
  let purchaseSettings;
  try {
    [tenant, doc, purchaseSettings] = await Promise.all([
      getTenantInfo(),
      getCommercialDocument(id),
      getPurchaseSettings().catch(() => ({ requireSupplierInvoiceNo: false })),
    ]);
  } catch {
    redirect('/login');
  }
  if (!doc || doc.documentType !== 'goods_receipt') redirect('/purchase/receipts');

  return (
    <BookOneShell active="Goods Received" tenant={tenant}>
      <CommercialDocumentDetail
        doc={doc}
        listHref="/purchase/receipts"
        listLabel="Goods received"
        printHref={`/purchase/print/${doc.id}`}
        convertTo={doc.status !== 'converted' ? 'purchase' : undefined}
        convertLabel="To purchase bill"
        requireSupplierInvoiceNo={purchaseSettings.requireSupplierInvoiceNo}
      />
    </BookOneShell>
  );
}
