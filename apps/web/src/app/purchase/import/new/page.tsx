import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewImportPurchasePage() {
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData('vendor')]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Import Purchases" tenant={tenant}>
      <CommercialDocNewForm
        backHref="/purchase/import"
        backLabel="Import purchases"
        documentType="import_purchase"
        partyLabel="Supplier / agent"
        partyPlaceholder="Overseas supplier"
        products={form.products}
        partyOptions={form.partyOptions}
        showExpenseAccount
        showPurchaseExtras
        showLandedCost
        showPurchaseVat
        vatRegistered={form.vatRegistered}
        vatRatePercent={form.vatRatePercent}
        expenseAccounts={form.expenseAccounts}
        defaultPaymentTerms={form.purchaseSettings.defaultPaymentTerms}
        defaultExpenseAccount={form.purchaseSettings.defaultExpenseAccount}
        brands={form.brands}
          locations={form.locations}
        submitLabel="Save import purchase"
        banner="Import · inventory 5100 + landed costs + AP · optional input VAT"
      />
    </BookOneShell>
  );
}
