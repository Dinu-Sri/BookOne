import { redirect } from 'next/navigation';
import { listAdvanceParties, listOpenAdvanceDocuments, listPartyAdvances } from '@/app/actions/advances';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { AdvancesPanel } from '@/components/advances/advances-panel';
import { assertPermission, jobCanWrite } from '@/lib/access';

export default async function AdvancesPage() {
  await assertPermission('accounting.accounts.read', 'read', { surface: 'rsc' });
  let tenant;
  let advances;
  let people;
  let documents;
  try {
    [tenant, advances, people, documents] = await Promise.all([
      getTenantInfo(),
      listPartyAdvances(),
      listAdvanceParties(),
      listOpenAdvanceDocuments(),
    ]);
  } catch {
    redirect('/login?from=/advances');
  }
  const canWrite =
    jobCanWrite(tenant, 'Receive Payments') ||
    jobCanWrite(tenant, 'Pay Vendors') ||
    jobCanWrite(tenant, 'Simple Entry') ||
    jobCanWrite(tenant, 'Accounts');

  return (
    <BookOneShell active="Advances" tenant={tenant}>
      <AdvancesPanel advances={advances} parties={people} documents={documents} canWrite={canWrite} />
    </BookOneShell>
  );
}
