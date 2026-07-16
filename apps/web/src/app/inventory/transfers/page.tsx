import { redirect } from 'next/navigation';
import Link from 'next/link';
import { listStockDocs } from '@/app/actions/inventory';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { ModulePageHeader, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

export default async function StockTransfersPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listStockDocs('transfer')]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Stock Transfers" tenant={tenant}>
      <div className="workspace">
        <ModulePageHeader
          eyebrow="Inventory"
          title="Stock transfers"
          lead="Move quantity between locations. Inventory GL total is unchanged."
          newHref="/inventory/transfers/new"
          newLabel="New transfer"
        />
        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            {rows.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <h3>No transfers yet</h3>
                <p>Transfer stock when you use multiple locations.</p>
                <div style={{ marginTop: 12 }}>
                  <Link href="/inventory/transfers/new">
                    <Button variant="primary" type="button">New transfer</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Date</th>
                      <th>Lines</th>
                      <th>Status</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td><strong>{r.documentNumber}</strong></td>
                        <td>{r.docDate}</td>
                        <td>{r.lineCount}</td>
                        <td><StatusBadge status={r.status} /></td>
                        <td>{r.reason ?? '—'}</td>
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
