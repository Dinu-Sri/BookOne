import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewPurchaseReturnPage() {
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData('vendor')]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Purchase Returns" tenant={tenant}>
      <CommercialDocNewForm
        backHref="/purchase/returns"
        backLabel="Purchase returns"
        documentType="purchase_return"
        partyLabel="Vendor"
        partyPlaceholder="Vendor name"
        products={form.products}
        partyOptions={form.partyOptions}
        showExpenseAccount
        expenseAccounts={form.expenseAccounts}
        submitLabel="Save purchase return"
      />
    </BookOneShell>
  );
}
