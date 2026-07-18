import { redirect } from 'next/navigation';
import { getCommercialDocument } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentDetail } from '@/components/purchase/commercial-document-detail';

export default async function ImportPurchaseDetailPage({
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
  if (!doc || doc.documentType !== 'import_purchase') redirect('/purchase/import');

  return (
    <BookOneShell active="Import Purchases" tenant={tenant}>
      <CommercialDocumentDetail
        doc={doc}
        listHref="/purchase/import"
        listLabel="Import purchases"
        payHref={doc.balanceDue > 0.005 ? `/purchase/payments/new?documentId=${doc.id}` : null}
      />
    </BookOneShell>
  );
}
