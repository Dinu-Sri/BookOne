import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocList } from '@/components/module/commercial-doc-screens';

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
      <CommercialDocList
        newHref="/sales/quotations/new"
        newLabel="New quotation"
        rows={rows}
        emptyTitle="No quotations yet"
        searchPlaceholder="Search quotations…"
        convertTo="sales_order"
        convertLabel="To order"
      />
    </BookOneShell>
  );
}
