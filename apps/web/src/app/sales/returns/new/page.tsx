import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewSalesReturnPage() {
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Sales Returns" tenant={tenant}>
      <CommercialDocNewForm
        eyebrow="Sales"
        title="New sales return"
        lead="Reverse revenue via account 4100 and restock stocked products."
        backHref="/sales/returns"
        documentType="sales_return"
        partyLabel="Customer"
        partyPlaceholder="Customer name"
        products={form.products}
      />
    </BookOneShell>
  );
}
