import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocumentList } from '@/components/sales/commercial-document-list';

export default async function SalesReturnsPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listCommercialDocuments(['sales_return'])]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Sales Returns" tenant={tenant}>
      <Suspense fallback={<div className="workspace party-workspace">Loading…</div>}>
        <CommercialDocumentList
          rows={rows}
          config={{
            title: 'Sales return',
            searchPlaceholder: 'Search by customer name or number…',
            newHref: '/sales/returns/new',
            newLabel: 'New return',
          }}
        />
      </Suspense>
    </BookOneShell>
  );
}
