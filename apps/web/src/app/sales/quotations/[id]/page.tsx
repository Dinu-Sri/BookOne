import { redirect } from 'next/navigation';
import { getCommercialDocument } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentDetail } from '@/components/purchase/commercial-document-detail';

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenant;
  let doc;
  try {
    [tenant, doc] = await Promise.all([getTenantInfo(), getCommercialDocument(id)]);
  } catch {
    redirect('/login');
  }
  if (!doc || doc.documentType !== 'quotation') redirect('/sales/quotations');

  return (
    <BookOneShell active="Quotations" tenant={tenant}>
      <CommercialDocumentDetail
        doc={doc}
        listHref="/sales/quotations"
        listLabel="Quotations"
        printHref={`/sales/quotations/${doc.id}/print`}
        editHref={doc.status !== 'converted' && doc.status !== 'void' ? `/sales/quotations/${doc.id}/edit` : null}
        convertTo="sales_order"
        convertLabel="Convert to order"
      />
    </BookOneShell>
  );
}
