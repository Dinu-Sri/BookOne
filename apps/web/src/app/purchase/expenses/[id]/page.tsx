import { redirect } from 'next/navigation';
import { getCommercialDocument } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentDetail } from '@/components/purchase/commercial-document-detail';

export default async function CashPurchaseDetailPage({
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
  if (!doc || doc.documentType !== 'cash_purchase') redirect('/purchase/expenses');

  return (
    <BookOneShell active="Cash Purchases" tenant={tenant}>
      <CommercialDocumentDetail
        doc={doc}
        listHref="/purchase/expenses"
        listLabel="Cash purchases"
        printHref={`/purchase/expenses/${doc.id}/print`}
        returnFromBill
      />
    </BookOneShell>
  );
}
