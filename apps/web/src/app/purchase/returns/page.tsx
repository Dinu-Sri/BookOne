import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentList } from '@/components/sales/commercial-document-list';

export default async function PurchaseReturnsPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([
      getTenantInfo(),
      listCommercialDocuments(['purchase_return']),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Purchase Returns" tenant={tenant}>
      <Suspense fallback={<div className="workspace party-workspace">Loading…</div>}>
        <CommercialDocumentList
          rows={rows}
          config={{
            title: 'Purchase return',
            partyLabel: 'Vendor',
            searchPlaceholder: 'Search by vendor name or number…',
            newHref: '/purchase/returns/new',
            newLabel: 'New purchase return',
          }}
        />
      </Suspense>
    </BookOneShell>
  );
}
