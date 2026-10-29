import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { SalesDocumentForm } from '@/components/sales/sales-document-form';
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
      <div className="workspace party-workspace">
        <SalesDocumentForm
          documentType="sales_return"
          backHref="/sales/returns"
          backLabel="Sales returns"
          submitLabel="Save return"
          products={form.products}
          partyOptions={form.partyOptions}
          brands={form.brands}
          locations={form.locations}
          showPaymentAccount
          paymentAccounts={form.paymentAccounts}
          allowEmptyPaymentAccount
          banner="Restocks physical products · posts sales returns. Refund from cash/bank/card to settle the credit, or leave credit-only to reduce AR."
        />
      </div>
    </BookOneShell>
  );
}
