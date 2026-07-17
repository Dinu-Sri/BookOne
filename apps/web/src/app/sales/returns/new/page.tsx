import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewSalesReturnPage() {
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData('customer')]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Sales Returns" tenant={tenant}>
      <CommercialDocNewForm
        backHref="/sales/returns"
        backLabel="Sales returns"
        documentType="sales_return"
        partyLabel="Customer"
        partyPlaceholder="Customer name"
        products={form.products}
        partyOptions={form.partyOptions}
        submitLabel="Save return"
      />
    </BookOneShell>
  );
}
