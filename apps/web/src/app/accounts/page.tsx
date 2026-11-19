import { redirect } from 'next/navigation';
import { getTenantInfo, listAccountsWithBalances } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CoaManager } from '@/components/accounts/coa-manager';
import { assertScreenAccess, jobCanWrite } from '@/lib/access';

export default async function AccountsPage({
  searchParams,
}: {
  searchParams?: Promise<{ focus?: string }>;
}) {
  await assertScreenAccess('/accounts', 'read');
  const params = searchParams ? await searchParams : {};
  let tenant;
  let accounts;
  try {
    [tenant, accounts] = await Promise.all([getTenantInfo(), listAccountsWithBalances()]);
  } catch {
    redirect('/login?from=/accounts');
  }

  return (
    <BookOneShell active="Accounts" tenant={tenant}>
      <CoaManager
        accounts={accounts}
        currency={tenant.baseCurrency || 'LKR'}
        canWrite={jobCanWrite(tenant, 'Accounts')}
        focus={params.focus}
      />
    </BookOneShell>
  );
}
