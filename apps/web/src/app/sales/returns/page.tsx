import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocList } from '@/components/module/commercial-doc-screens';

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
      <CommercialDocList
        eyebrow="Sales"
        title="Sales returns"
        lead="Posts to Sales Returns (4100), reduces AR, and restocks inventory."
        newHref="/sales/returns/new"
        newLabel="New return"
        rows={rows}
        emptyTitle="No sales returns yet"
      />
    </BookOneShell>
  );
}
