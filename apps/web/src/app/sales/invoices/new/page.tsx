import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getSalesSettings } from '@/app/actions/sales-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { loadSalesFormData } from '@/lib/module-page-helpers';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { InvoiceDocumentForm } from '@/components/sales/invoice-document-form';

export default async function NewSalesInvoicePage() {
  let tenant;
  let form;
  let settings;
  let openOrders;
  try {
    [tenant, form, settings, openOrders] = await Promise.all([
      getTenantInfo(),
      loadSalesFormData('customer'),
      getSalesSettings(),
      listCommercialDocuments(['sales_order']),
    ]);
  } catch {
    redirect('/login');
  }

  const orders = openOrders
    .filter((o) => o.status !== 'fully_invoiced' && o.status !== 'converted')
    .map((o) => ({
      id: o.id,
      documentNumber: o.documentNumber,
      partyName: o.partyName,
      total: o.total,
      status: o.status,
    }));

  return (
    <BookOneShell active="Sales Invoices" tenant={tenant}>
      <div className="workspace party-workspace">
        <InvoiceDocumentForm
          products={form.products}
          partyOptions={form.partyOptions}
          settings={settings}
          openOrders={orders}
        />
      </div>
    </BookOneShell>
  );
}
