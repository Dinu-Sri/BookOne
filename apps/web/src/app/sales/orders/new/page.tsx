import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewSalesOrderPage() {
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData('customer')]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Sales Orders" tenant={tenant}>
      <CommercialDocNewForm
        backHref="/sales/orders"
        backLabel="Sales orders"
        documentType="sales_order"
        partyLabel="Customer"
        partyPlaceholder="Customer name"
        products={form.products}
        partyOptions={form.partyOptions}
        discounts={form.discounts}
        submitLabel="Save sales order"
      />
    </BookOneShell>
  );
}
