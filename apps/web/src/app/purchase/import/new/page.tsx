import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocNewForm } from '@/components/module/commercial-doc-screens';
import { loadSalesFormData } from '@/lib/module-page-helpers';

export default async function NewImportPurchasePage() {
  let tenant;
  let form;
  try {
    [tenant, form] = await Promise.all([getTenantInfo(), loadSalesFormData()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Import Purchases" tenant={tenant}>
      <CommercialDocNewForm
        eyebrow="Purchase"
        title="New import purchase"
        lead="Import shipment. Always capitalizes to Inventory (5100) with AP (2100)."
        backHref="/purchase/import"
        documentType="import_purchase"
        partyLabel="Supplier / agent"
        partyPlaceholder="Overseas supplier"
        products={form.products}
        showExpenseAccount
        expenseAccounts={form.expenseAccounts}
      />
    </BookOneShell>
  );
}
