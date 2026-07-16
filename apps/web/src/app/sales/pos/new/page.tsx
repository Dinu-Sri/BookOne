import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewPosSalePage() {
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData('customer')]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="POS" tenant={tenant}>
      <CommercialDocNewForm
        eyebrow="Sales"
        title="New POS sale"
        lead="Walk-up sale settled immediately to cash, bank, or card clearing."
        backHref="/sales/pos"
        documentType="pos_sale"
        partyLabel="Customer (optional name)"
        partyPlaceholder="Walk-in customer"
        products={form.products}
        partyOptions={form.partyOptions}
        discounts={form.discounts}
        showPaymentAccount
        paymentAccounts={form.paymentAccounts}
        defaultPaymentCode="1000"
      />
    </BookOneShell>
  );
}
