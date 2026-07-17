import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocList } from '@/components/module/commercial-doc-screens';

export default async function PurchaseReturnsPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([
      getTenantInfo(),
      listCommercialDocuments(['purchase_return']),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Purchase Returns" tenant={tenant}>
      <CommercialDocList
        newHref="/purchase/returns/new"
        newLabel="New purchase return"
        rows={rows}
        emptyTitle="No purchase returns yet"
        searchPlaceholder="Search purchase returns…"
      />
    </BookOneShell>
  );
}
