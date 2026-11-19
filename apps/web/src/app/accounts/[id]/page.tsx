import { notFound, redirect } from 'next/navigation';
import { getTenantInfo, listAccountsWithBalances } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CoaAccountDetail } from '@/components/accounts/coa-account-detail';
import { assertScreenAccess, jobCanWrite } from '@/lib/access';

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenant;
  let accounts;
  try {
    [tenant, accounts] = await Promise.all([getTenantInfo(), listAccountsWithBalances()]);
  } catch {
    redirect('/login?from=/accounts');
  }
  await assertScreenAccess('/accounts', 'read');
  const account = accounts.find((row) => row.id === id);
  if (!account) notFound();
  const currency = tenant.baseCurrency || 'LKR';
  const money = `${account.balance < 0 ? '-' : ''}${currency} ${Math.abs(account.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <BookOneShell active="Accounts" tenant={tenant}>
      <div className="workspace party-workspace">
        <CoaAccountDetail
          account={account}
          accounts={accounts}
          currency={currency}
          money={money}
          canWrite={jobCanWrite(tenant, 'Accounts')}
        />
      </div>
    </BookOneShell>
  );
}
