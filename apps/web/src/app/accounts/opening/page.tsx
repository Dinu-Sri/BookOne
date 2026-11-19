import { redirect } from 'next/navigation';
import { getTenantInfo, listAccountsWithBalances } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CoaOpening } from '@/components/accounts/coa-opening';
import { assertScreenAccess, jobCanWrite } from '@/lib/access';

export default async function OpeningBalancesPage() {
  let tenant;
  let accounts;
  try {
    [tenant, accounts] = await Promise.all([getTenantInfo(), listAccountsWithBalances()]);
  } catch {
    redirect('/login?from=/accounts/opening');
  }
  await assertScreenAccess('/accounts', 'read');
  if (!jobCanWrite(tenant, 'Accounts')) redirect('/accounts');
  return (
    <BookOneShell active="Accounts" tenant={tenant}>
      <div className="workspace">
        <CoaOpening accounts={accounts} />
      </div>
    </BookOneShell>
  );
}
