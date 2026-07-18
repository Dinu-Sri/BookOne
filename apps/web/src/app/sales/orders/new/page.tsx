import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { SalesDocumentForm } from '@/components/sales/sales-document-form';
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
      <div className="workspace party-workspace">
        <SalesDocumentForm
          documentType="sales_order"
          backHref="/sales/orders"
          backLabel="Sales orders"
          submitLabel="Save sales order"
          products={form.products}
          partyOptions={form.partyOptions}
          discounts={form.discounts}
          banner="Dispatch note · no GL until invoice"
        />
      </div>
    </BookOneShell>
  );
}
