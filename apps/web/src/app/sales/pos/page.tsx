import { redirect } from 'next/navigation';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CommercialDocList } from '@/components/module/commercial-doc-screens';

export default async function PosPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listCommercialDocuments(['pos_sale'])]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="POS" tenant={tenant}>
      <CommercialDocList
        eyebrow="Sales"
        title="POS sales"
        lead="Immediate cash/card sales — settled on post with optional COGS."
        newHref="/sales/pos/new"
        newLabel="New POS sale"
        rows={rows}
        emptyTitle="No POS sales yet"
      />
    </BookOneShell>
  );
}
