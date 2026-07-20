import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewPurchasePage() {
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData('vendor')]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Purchases" tenant={tenant}>
      <CommercialDocNewForm
        backHref="/purchase/purchases"
        backLabel="Purchases"
        documentType="purchase"
        partyLabel="Vendor"
        partyPlaceholder="Vendor name"
        products={form.products}
        partyOptions={form.partyOptions}
        showExpenseAccount
        showPurchaseExtras
        showPurchaseVat
        vatRegistered={form.vatRegistered}
        vatRatePercent={form.vatRatePercent}
        expenseAccounts={form.expenseAccounts}
        defaultPaymentTerms={form.purchaseSettings.defaultPaymentTerms}
        defaultExpenseAccount={form.purchaseSettings.defaultExpenseAccount}
        brands={form.brands}
          locations={form.locations}
        submitLabel="Save purchase"
        banner={
          form.purchaseSettings.requireBillApproval
            ? 'Credit purchase · saves as pending approval until approved'
            : 'Credit purchase · opens AP 2100 · optional input VAT'
        }
      />
    </BookOneShell>
  );
}
