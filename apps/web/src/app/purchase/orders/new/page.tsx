import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewPurchaseOrderPage() {
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Purchase Orders" tenant={tenant}>
      <CommercialDocNewForm
        eyebrow="Purchase"
        title="New purchase order"
        lead="Order goods or services from a vendor."
        backHref="/purchase/orders"
        documentType="purchase_order"
        partyLabel="Vendor"
        partyPlaceholder="Vendor name"
        products={form.products}
        showExpenseAccount
        expenseAccounts={form.expenseAccounts}
      />
    </BookOneShell>
  );
}
