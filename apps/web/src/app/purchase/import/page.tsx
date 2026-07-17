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
        newHref="/purchase/import/new"
        newLabel="New import purchase"
        rows={rows}
        emptyTitle="No import purchases yet"
        searchPlaceholder="Search import purchases…"
      />
    </BookOneShell>
  );
}
