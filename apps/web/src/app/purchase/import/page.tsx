import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentList } from '@/components/sales/commercial-document-list';

export default async function ImportPurchasesPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([
      getTenantInfo(),
      listCommercialDocuments(['import_purchase']),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Import Purchases" tenant={tenant}>
      <Suspense fallback={<div className="workspace party-workspace">Loading…</div>}>
        <CommercialDocumentList
          rows={rows}
          config={{
            title: 'Import purchase',
            partyLabel: 'Vendor',
            searchPlaceholder: 'Search by vendor name or number…',
            newHref: '/purchase/import/new',
            newLabel: 'New import purchase',
          }}
        />
      </Suspense>
    </BookOneShell>
  );
}
