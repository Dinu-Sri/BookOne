import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocList } from '@/components/module/commercial-doc-screens';

export default async function PurchasesPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([
      getTenantInfo(),
      listCommercialDocuments(['purchase', 'vendor_bill']),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Purchases" tenant={tenant}>
      <CommercialDocList
        newHref="/purchase/purchases/new"
        newLabel="New purchase"
        rows={rows}
        emptyTitle="No purchases yet"
        searchPlaceholder="Search purchases…"
      />
    </BookOneShell>
  );
}
