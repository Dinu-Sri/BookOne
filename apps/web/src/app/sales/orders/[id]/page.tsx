import { redirect } from 'next/navigation';
import { getCommercialDocument } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentDetail } from '@/components/purchase/commercial-document-detail';

export default async function SalesOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenant;
  let doc;
  try {
    [tenant, doc] = await Promise.all([getTenantInfo(), getCommercialDocument(id)]);
  } catch {
    redirect('/login');
  }
  if (!doc || doc.documentType !== 'sales_order') redirect('/sales/orders');

  return (
    <BookOneShell active="Sales Orders" tenant={tenant}>
      <CommercialDocumentDetail
        doc={doc}
        listHref="/sales/orders"
        listLabel="Sales orders"
        convertTo="sales_invoice"
        convertLabel="To invoice"
      />
    </BookOneShell>
  );
}
