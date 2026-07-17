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
        newHref="/sales/pos/new"
        newLabel="New POS sale"
        rows={rows}
        emptyTitle="No POS sales yet"
        searchPlaceholder="Search POS…"
      />
    </BookOneShell>
  );
}
