import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getSalesSettings } from '@/app/actions/sales-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { loadSalesFormData } from '@/lib/module-page-helpers';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { InvoiceDocumentForm } from '@/components/sales/invoice-document-form';
import { Button, Card } from '@/components/ui/bookone-ui';
import Link from 'next/link';

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

  const canWrite =
    tenant.platformRole === 'super_admin' || tenant.accessByLabel?.['Sales Invoices'] !== 'read';
  if (!canWrite) {
    return (
      <BookOneShell active="Sales Invoices" tenant={tenant}>
        <div className="workspace party-workspace">
          <Card>
            <div className="card-body">
              <h2 className="card-title">Cannot create invoices</h2>
              <p style={{ color: 'var(--ink-muted)', marginTop: 8 }}>
                Your job can view sales invoices but cannot save or post them.
              </p>
              <div style={{ marginTop: 14 }}>
                <Link href="/sales/invoices">
                  <Button variant="secondary" type="button">
                    Back to invoices
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </BookOneShell>
    );
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
          brands={form.brands}
          locations={form.locations}
          discounts={form.discounts}
        />
      </div>
    </BookOneShell>
  );
}
