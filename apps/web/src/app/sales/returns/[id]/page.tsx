import { redirect } from 'next/navigation';
import { getCommercialDocument } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentDetail } from '@/components/purchase/commercial-document-detail';

export default async function SalesReturnDetailPage({
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
  if (!doc || doc.documentType !== 'sales_return') redirect('/sales/returns');

  return (
    <BookOneShell active="Sales Returns" tenant={tenant}>
      <CommercialDocumentDetail
        doc={doc}
        listHref="/sales/returns"
        listLabel="Sales returns"
        printHref={`/sales/returns/${doc.id}/print`}
      />
    </BookOneShell>
  );
}
