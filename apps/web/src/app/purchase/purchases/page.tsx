import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentList } from '@/components/sales/commercial-document-list';

export default async function PurchasesPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([
      getTenantInfo(),
      listCommercialDocuments(['purchase', 'vendor_bill']),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Purchases" tenant={tenant}>
      <Suspense fallback={<div className="workspace party-workspace">Loading…</div>}>
        <CommercialDocumentList
          rows={rows}
          config={{
            title: 'Purchase',
            partyLabel: 'Vendor',
            searchPlaceholder: 'Search by vendor name or number…',
            newHref: '/purchase/purchases/new',
            newLabel: 'New purchase',
            detailHrefPattern: '/purchase/purchases/:id',
            payHrefPattern: '/purchase/payments/new?documentId=:id',
          }}
        />
      </Suspense>
    </BookOneShell>
  );
}
