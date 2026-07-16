import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewSalesOrderPage() {
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Sales Orders" tenant={tenant}>
      <CommercialDocNewForm
        eyebrow="Sales"
        title="New sales order"
        lead="Confirm a customer order. Convert to invoice to post accounting."
        backHref="/sales/orders"
        documentType="sales_order"
        partyLabel="Customer"
        partyPlaceholder="Customer name"
        products={form.products}
        discounts={form.discounts}
      />
    </BookOneShell>
  );
}
