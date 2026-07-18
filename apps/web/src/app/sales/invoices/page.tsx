import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentList } from '@/components/sales/commercial-document-list';

export default async function SalesInvoicesPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([
      getTenantInfo(),
      listCommercialDocuments(['sales_invoice', 'customer_invoice']),
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
            printHref: (id) => `/sales/invoices/${id}/print`,
          }}
        />
      </Suspense>
    </BookOneShell>
  );
}
