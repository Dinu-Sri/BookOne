import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewPurchaseOrderPage() {
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData('vendor')]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Purchase Orders" tenant={tenant}>
      <CommercialDocNewForm
        backHref="/purchase/orders"
        backLabel="Purchase orders"
        documentType="purchase_order"
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
        brands={form.brands}
          locations={form.locations}
        submitLabel="Save purchase order"
        banner={
          form.vatRegistered
            ? 'No GL until converted to purchase. Claim input VAT is stored as intent and posts on the bill.'
            : 'No GL until converted to purchase'
        }
      />
    </BookOneShell>
  );
}
