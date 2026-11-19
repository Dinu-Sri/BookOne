import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CoaImport } from '@/components/accounts/coa-import';
import { assertScreenAccess, jobCanWrite } from '@/lib/access';

export default async function ChartImportPage() {
  await assertScreenAccess('/accounts', 'write');
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login?from=/accounts/import');
  }
  if (!jobCanWrite(tenant, 'Accounts')) redirect('/accounts');
  return (
    <BookOneShell active="Accounts" tenant={tenant}>
      <div className="workspace">
        <CoaImport />
      </div>
    </BookOneShell>
  );
}
