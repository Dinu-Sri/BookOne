import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocList } from '@/components/module/commercial-doc-screens';

export default async function PurchaseOrdersPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listCommercialDocuments(['purchase_order'])]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Purchase Orders" tenant={tenant}>
      <CommercialDocList
        newHref="/purchase/orders/new"
        newLabel="New purchase order"
        rows={rows}
        emptyTitle="No purchase orders yet"
        searchPlaceholder="Search purchase orders…"
        convertTo="purchase"
        convertLabel="To purchase"
      />
    </BookOneShell>
  );
}
