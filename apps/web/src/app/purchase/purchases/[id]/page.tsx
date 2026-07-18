import { redirect } from 'next/navigation';
import { getCommercialDocument } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentDetail } from '@/components/purchase/commercial-document-detail';

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenant;
  let doc;
  try {
    [tenant, doc] = await Promise.all([getTenantInfo(), getCommercialDocument(id)]);
  } catch {
    redirect('/login');
  }
  if (!doc) redirect('/purchase/purchases');
  if (!['purchase', 'vendor_bill', 'import_purchase'].includes(doc.documentType)) {
    if (doc.documentType === 'import_purchase') {
      /* allow */
    } else if (doc.documentType === 'cash_purchase') {
      redirect(`/purchase/expenses/${id}`);
    } else {
      redirect('/purchase/purchases');
    }
  }

  const isImport = doc.documentType === 'import_purchase';
  const listHref = isImport ? '/purchase/import' : '/purchase/purchases';
  const listLabel = isImport ? 'Import purchases' : 'Purchases';

  return (
    <BookOneShell active={isImport ? 'Import Purchases' : 'Purchases'} tenant={tenant}>
      <CommercialDocumentDetail
        doc={doc}
        listHref={listHref}
        listLabel={listLabel}
        payHref={doc.balanceDue > 0.005 ? `/purchase/payments/new?documentId=${doc.id}` : null}
        printHref={`/purchase/print/${doc.id}`}
        returnFromBill
      />
    </BookOneShell>
  );
}
