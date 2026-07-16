import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewQuotationPage() {
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData('customer')]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Quotations" tenant={tenant}>
      <CommercialDocNewForm
        eyebrow="Sales"
        title="New quotation"
        lead="Create a multi-line quote. Convert later to a sales order or invoice."
        backHref="/sales/quotations"
        documentType="quotation"
        partyLabel="Customer"
        partyPlaceholder="Customer name"
        products={form.products}
        partyOptions={form.partyOptions}
        discounts={form.discounts}
      />
    </BookOneShell>
  );
}
