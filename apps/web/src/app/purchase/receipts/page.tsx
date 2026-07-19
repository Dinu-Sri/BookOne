import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentList } from '@/components/sales/commercial-document-list';

export default async function GoodsReceiptsPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([
      getTenantInfo(),
      listCommercialDocuments(['goods_receipt']),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Goods Received" tenant={tenant}>
      <Suspense fallback={<div className="workspace party-workspace">Loading…</div>}>
        <CommercialDocumentList
          rows={rows}
          config={{
            title: 'Goods receipt',
            partyLabel: 'Vendor',
            searchPlaceholder: 'Search by vendor or GRN number…',
            newHref: '/purchase/receipts/new',
            newLabel: 'New GRN',
            detailHrefPattern: '/purchase/receipts/:id',
            printHrefPattern: '/purchase/print/:id',
            convertTo: 'purchase',
            convertLabel: 'To purchase bill',
          }}
        />
      </Suspense>
    </BookOneShell>
  );
}
