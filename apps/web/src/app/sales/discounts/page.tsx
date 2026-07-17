import { redirect } from 'next/navigation';
import Link from 'next/link';
import { listDiscounts } from '@/app/actions/discounts';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

export default async function DiscountsPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listDiscounts()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Discounts" tenant={tenant}>
      <div className="workspace party-workspace">
        <div className="party-toolbar">
          <div className="party-search-form">
            <input className="input party-search" placeholder="Search discounts…" disabled />
          </div>
          <Link href="/sales/discounts/new">
            <Button variant="primary" type="button">
              New discount
            </Button>
          </Link>
        </div>
        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            {rows.length === 0 ? (
              <div className="empty-state" style={{ padding: 28 }}>
                <h3>No discounts yet</h3>
                <p>Define percent or fixed discounts for sales documents.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Code</th>
                      <th>Type</th>
                      <th>Value</th>
                      <th>Active</th>
                      <th>Dates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.name}</strong>
                        </td>
                        <td>{r.code ?? '—'}</td>
                        <td>{r.discountType}</td>
                        <td>{r.discountType === 'percent' ? `${r.value}%` : formatLKR(r.value)}</td>
                        <td>
                          <StatusBadge status={r.isActive === '1' ? 'active' : 'void'} />
                        </td>
                        <td>{[r.startsOn, r.endsOn].filter(Boolean).join(' → ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>
    </BookOneShell>
  );
}
