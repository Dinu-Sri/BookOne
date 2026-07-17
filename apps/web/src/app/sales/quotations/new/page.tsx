import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { QuotationForm } from '@/components/sales/quotation-form';
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
      <div className="workspace party-workspace">
        <QuotationForm
          products={form.products}
          partyOptions={form.partyOptions}
          discounts={form.discounts}
        />
      </div>
    </BookOneShell>
  );
}
