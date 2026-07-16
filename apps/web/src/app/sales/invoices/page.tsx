import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocList } from '@/components/module/commercial-doc-screens';

export default async function SalesInvoicesPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([
      getTenantInfo(),
      listCommercialDocuments(['sales_invoice', 'customer_invoice']),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Sales Invoices" tenant={tenant}>
      <CommercialDocList
        eyebrow="Sales"
        title="Sales invoices"
        lead="Posts AR and revenue (plus COGS/inventory for stocked products)."
        newHref="/sales/invoices/new"
        newLabel="New invoice"
        rows={rows}
        emptyTitle="No sales invoices yet"
      />
    </BookOneShell>
  );
}
