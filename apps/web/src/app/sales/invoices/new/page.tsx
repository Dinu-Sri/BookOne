import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewSalesInvoicePage() {
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData('customer')]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Sales Invoices" tenant={tenant}>
      <CommercialDocNewForm
        eyebrow="Sales"
        title="New sales invoice"
        lead="Creates AR + revenue journals. Stocked products also post COGS."
        backHref="/sales/invoices"
        documentType="sales_invoice"
        partyLabel="Customer"
        partyPlaceholder="Customer name"
        products={form.products}
        partyOptions={form.partyOptions}
        creditWarning
        discounts={form.discounts}
      />
    </BookOneShell>
  );
}
