import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocList } from '@/components/module/commercial-doc-screens';

export default async function SalesOrdersPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listCommercialDocuments(['sales_order'])]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Sales Orders" tenant={tenant}>
      <CommercialDocList
        eyebrow="Sales"
        title="Sales orders"
        lead="Confirmed customer orders. No GL impact until invoiced."
        newHref="/sales/orders/new"
        newLabel="New sales order"
        rows={rows}
        emptyTitle="No sales orders yet"
        convertTo="sales_invoice"
        convertLabel="To invoice"
      />
    </BookOneShell>
  );
}
