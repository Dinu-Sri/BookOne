import { notFound, redirect } from 'next/navigation';
import { getTenantInfo, listAccountsWithBalances } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Card } from '@/components/ui/bookone-ui';
import { assertScreenAccess } from '@/lib/access';
import Link from 'next/link';

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
      <div className="workspace">
        <Card>
          <div className="card-header">
            <div>
              <p className="eyebrow">{account.code}</p>
              <h1 className="card-title" style={{ marginTop: 4 }}>
                {account.name}
              </h1>
            </div>
            <Badge tone={account.isActive === '0' ? 'warning' : 'success'}>
              {account.isActive === '0' ? 'Archived' : 'Active'}
            </Badge>
          </div>
          <div className="card-body">
            <p>
              Class {account.type} · subtype {account.subtype || '—'} · normal {account.normalSide}
            </p>
            <p>
              Liquidity {account.liquidity || 'none'} · control {account.controlRole || 'none'}
              {account.isSystem === '1' ? ' · system control' : ''}
              {account.isGroup === '1' ? ' · group heading (no postings)' : ''}
            </p>
            <p>
              Balance {money}. Creating an account starts at zero; opening balances are a separate posting.
            </p>
            <p>
              <Link href={`/journal?account=${account.code}`}>Open ledger</Link>
              {' · '}
              <Link href="/accounts">Back to chart</Link>
            </p>
          </div>
        </Card>
      </div>
    </BookOneShell>
  );
}
