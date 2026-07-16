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
        eyebrow="Sales"
        title="Quotations"
        lead="Price offers before commitment. No journal posts until converted to invoice."
        newHref="/sales/quotations/new"
        newLabel="New quotation"
        rows={rows}
        emptyTitle="No quotations yet"
        convertTo="sales_order"
        convertLabel="To order"
      />
    </BookOneShell>
  );
}
