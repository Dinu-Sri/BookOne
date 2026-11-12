import { redirect } from 'next/navigation';
import { getCommercialDocument } from '@/app/actions/commercial-docs';
import { getSalesSettings } from '@/app/actions/sales-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentDetail } from '@/components/purchase/commercial-document-detail';

export default async function PurchaseReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let tenant;
  let doc;
  let salesSettings;
  try {
    [tenant, doc, salesSettings] = await Promise.all([
      getTenantInfo(),
      getCommercialDocument(id),
      getSalesSettings().catch(() => ({ vatRegistered: false, vatRatePercent: 18 })),
    ]);
  } catch {
    redirect('/login');
  }
  if (!doc || doc.documentType !== 'purchase_return') redirect('/purchase/returns');

  return (
    <BookOneShell active="Purchase Returns" tenant={tenant}>
      <CommercialDocumentDetail
        doc={doc}
        listHref="/purchase/returns"
        listLabel="Purchase returns"
        printHref={`/purchase/print/${doc.id}`}
        vatRegistered={salesSettings.vatRegistered}
        vatRatePercent={salesSettings.vatRatePercent}
      />
    </BookOneShell>
  );
}
