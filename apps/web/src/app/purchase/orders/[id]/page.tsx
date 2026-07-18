import { redirect } from 'next/navigation';
import { getCommercialDocument } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentDetail } from '@/components/purchase/commercial-document-detail';

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let tenant;
  let doc;
  try {
    [tenant, doc] = await Promise.all([getTenantInfo(), getCommercialDocument(id)]);
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
        convertTo="purchase"
        convertLabel="To purchase"
      />
    </BookOneShell>
  );
}
