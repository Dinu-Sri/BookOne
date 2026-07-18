import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentList } from '@/components/sales/commercial-document-list';

export default async function PurchaseOrdersPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listCommercialDocuments(['purchase_order'])]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Purchase Orders" tenant={tenant}>
      <Suspense fallback={<div className="workspace party-workspace">Loading…</div>}>
        <CommercialDocumentList
          rows={rows}
          config={{
            title: 'Purchase order',
            partyLabel: 'Vendor',
            searchPlaceholder: 'Search by vendor name or number…',
            newHref: '/purchase/orders/new',
            newLabel: 'New purchase order',
            convertTo: 'purchase',
            convertLabel: 'To purchase',
            detailHrefPattern: '/purchase/orders/:id',
            printHrefPattern: '/purchase/print/:id',
          }}
        />
      </Suspense>
    </BookOneShell>
  );
}
