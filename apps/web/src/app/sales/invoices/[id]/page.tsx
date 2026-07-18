import { redirect } from 'next/navigation';
import { getCommercialDocument } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentDetail } from '@/components/purchase/commercial-document-detail';

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenant;
  let doc;
  try {
    [tenant, doc] = await Promise.all([getTenantInfo(), getCommercialDocument(id)]);
  } catch {
    redirect('/login');
  }
  if (!doc) redirect('/sales/invoices');
  if (!['sales_invoice', 'customer_invoice'].includes(doc.documentType)) {
    redirect('/sales/invoices');
  }

  return (
    <BookOneShell active="Sales Invoices" tenant={tenant}>
      <CommercialDocumentDetail
        doc={doc}
        listHref="/sales/invoices"
        listLabel="Invoices"
        printHref={`/sales/invoices/${doc.id}/print`}
      />
    </BookOneShell>
  );
}
