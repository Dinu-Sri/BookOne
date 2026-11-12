import { redirect } from 'next/navigation';
import {
  getCommercialDocument,
  getPurchaseOrderRemainingLines,
} from '@/app/actions/commercial-docs';
import { getPurchaseSettings } from '@/app/actions/purchase-settings';
import { getSalesSettings } from '@/app/actions/sales-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentDetail } from '@/components/purchase/commercial-document-detail';
import { PoConvertForm } from '@/components/purchase/po-convert-form';

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let tenant;
  let doc;
  let remaining;
  let purchaseSettings;
  let salesSettings;
  try {
    [tenant, doc, remaining, purchaseSettings, salesSettings] = await Promise.all([
      getTenantInfo(),
      getCommercialDocument(id),
      getPurchaseOrderRemainingLines(id),
      getPurchaseSettings().catch(() => ({ requireSupplierInvoiceNo: false })),
      getSalesSettings().catch(() => ({ vatRegistered: false, vatRatePercent: 18 })),
    ]);
  } catch {
    redirect('/login');
  }
  if (!doc || doc.documentType !== 'purchase_order') redirect('/purchase/orders');

  return (
    <BookOneShell active="Purchase Orders" tenant={tenant}>
      <CommercialDocumentDetail
        doc={doc}
        listHref="/purchase/orders"
        listLabel="Purchase orders"
        printHref={`/purchase/print/${doc.id}`}
        vatRegistered={salesSettings.vatRegistered}
        vatRatePercent={salesSettings.vatRatePercent}
        convertPanel={
          remaining.ok && remaining.lines ? (
            <PoConvertForm
              poId={doc.id}
              lines={remaining.lines}
              documentNumber={doc.documentNumber}
              requireSupplierInvoiceNo={purchaseSettings.requireSupplierInvoiceNo}
              vatRegistered={salesSettings.vatRegistered}
              vatRatePercent={salesSettings.vatRatePercent}
              sourceInvoiceKind={doc.invoiceKind}
            />
          ) : null
        }
      />
    </BookOneShell>
  );
}
