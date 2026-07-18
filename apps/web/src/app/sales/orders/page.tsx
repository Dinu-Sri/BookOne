import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentList } from '@/components/sales/commercial-document-list';

export default async function SalesOrdersPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listCommercialDocuments(['sales_order'])]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Sales Orders" tenant={tenant}>
      <Suspense fallback={<div className="workspace party-workspace">Loading…</div>}>
        <CommercialDocumentList
          rows={rows}
          config={{
            title: 'Sales order',
            searchPlaceholder: 'Search by customer name or number…',
            newHref: '/sales/orders/new',
            newLabel: 'New sales order',
            convertTo: 'sales_invoice',
            convertLabel: 'To invoice',
          }}
        />
      </Suspense>
    </BookOneShell>
  );
}
