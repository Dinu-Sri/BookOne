import { redirect } from 'next/navigation';
import { getTenantInfo, listAccountsWithBalances } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Card } from '@/components/ui/bookone-ui';

function formatLKR(value: number) {
  return `LKR ${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function typeTone(type: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (type) {
    case 'asset': return 'info';
    case 'liability': return 'warning';
    case 'equity': return 'neutral';
    case 'revenue': return 'success';
    case 'expense': return 'danger';
    default: return 'neutral';
  }
}

export default async function AccountsPage() {
  let tenant;
  let accounts;
  try {
    [tenant, accounts] = await Promise.all([getTenantInfo(), listAccountsWithBalances()]);
  } catch (err) {
    redirect('/login');
  }

  const grouped = accounts.reduce((acc, a) => {
    (acc[a.type] ??= []).push(a);
    return acc;
  }, {} as Record<string, typeof accounts>);

  return (
    <BookOneShell active="Accounts" tenant={tenant}>
      <div className="workspace">
        {(['asset', 'liability', 'equity', 'revenue', 'expense'] as const).map((type) => {
          const rows = grouped[type] ?? [];
          if (rows.length === 0) return null;
          const total = rows.reduce((s, r) => s + r.balance, 0);
          return (
            <Card key={type} style={{ marginBottom: 18 }}>
              <div className="card-header">
                <div>
                  <p className="eyebrow">Account type</p>
                  <h2 className="card-title" style={{ marginTop: 4, textTransform: 'capitalize' }}>{type}</h2>
                </div>
                <Badge tone={typeTone(type)}>
                  {rows.length} {rows.length === 1 ? 'account' : 'accounts'} · {formatLKR(total)}
                </Badge>
              </div>
              <div className="card-body">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Normal side</th>
                        <th style={{ textAlign: 'right' }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{r.code}</td>
                          <td>{r.name}</td>
                          <td><Badge tone={r.normalSide === 'debit' ? 'info' : 'warning'}>{r.normalSide}</Badge></td>
                          <td style={{ textAlign: 'right' }} className={r.balance < 0 ? 'amount-negative' : 'amount-positive'}>
                            {formatLKR(r.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </BookOneShell>
  );
}
