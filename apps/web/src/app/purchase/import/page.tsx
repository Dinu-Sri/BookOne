import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocList } from '@/components/module/commercial-doc-screens';

export default async function ImportPurchasesPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([
      getTenantInfo(),
      listCommercialDocuments(['import_purchase']),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Import Purchases" tenant={tenant}>
      <CommercialDocList
        eyebrow="Purchase"
        title="Import purchases"
        lead="Overseas/import stock receipts. Posts inventory asset and AP for accounting accuracy tests."
        newHref="/purchase/import/new"
        newLabel="New import purchase"
        rows={rows}
        emptyTitle="No import purchases yet"
      />
    </BookOneShell>
  );
}
