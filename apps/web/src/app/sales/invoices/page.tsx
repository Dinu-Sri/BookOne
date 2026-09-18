import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getSalesSettings } from '@/app/actions/sales-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentList } from '@/components/sales/commercial-document-list';

export default async function SalesInvoicesPage() {
  let tenant;
  let rows;
  let settings;
  try {
    [tenant, rows, settings] = await Promise.all([
      getTenantInfo(),
      listCommercialDocuments(['sales_invoice', 'customer_invoice']),
      getSalesSettings(),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Sales Invoices" tenant={tenant}>
      <Suspense fallback={<div className="workspace party-workspace">Loading…</div>}>
        <CommercialDocumentList
          rows={rows}
          config={{
            title: 'Invoice',
            searchPlaceholder: 'Search by customer name or number…',
            newHref: '/sales/invoices/new',
            newLabel: 'New invoice',
            showTaxCols: true,
            printHrefPattern: '/sales/invoices/:id/print',
            detailHrefPattern: '/sales/invoices/:id',
            editHrefPattern: '/sales/invoices/:id/edit',
            editLockDays: settings.editLockDays,
            payHrefPattern: '/sales/payments/new?documentId=:id',
          }}
        />
      </Suspense>
    </BookOneShell>
  );
}
