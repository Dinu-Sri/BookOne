import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { QuotationList } from '@/components/sales/quotation-list';

export default async function QuotationsPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listCommercialDocuments(['quotation'])]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Quotations" tenant={tenant}>
      <Suspense
        fallback={
          <div className="workspace party-workspace">
            <div className="empty-state" style={{ padding: 28 }}>
              Loading quotations…
            </div>
          </div>
        }
      >
        <QuotationList rows={rows} />
      </Suspense>
    </BookOneShell>
  );
}
