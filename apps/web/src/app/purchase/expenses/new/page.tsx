import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewCashPurchasePage() {
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData('vendor')]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Cash Purchases" tenant={tenant}>
      <CommercialDocNewForm
        backHref="/purchase/expenses"
        backLabel="Cash purchases"
        documentType="cash_purchase"
        partyLabel="Vendor"
        partyPlaceholder="Vendor name"
        products={form.products}
        partyOptions={form.partyOptions}
        showExpenseAccount
        showPurchaseExtras
        showPurchaseVat
        vatRegistered={form.vatRegistered}
        vatRatePercent={form.vatRatePercent}
        showPaymentAccount
        paymentAccounts={form.paymentAccounts}
        defaultPaymentCode="1000"
        expenseAccounts={form.expenseAccounts}
        brands={form.brands}
          locations={form.locations}
        submitLabel="Save cash purchase"
        banner="Paid now · Dr expense/inventory · Cr bank — no AP"
      />
    </BookOneShell>
  );
}
