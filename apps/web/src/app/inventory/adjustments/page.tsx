import { redirect } from 'next/navigation';
import Link from 'next/link';
import { listStockDocs } from '@/app/actions/inventory';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { ModulePageHeader, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

export default async function StockAdjustmentsPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listStockDocs('adjustment')]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Stock Adjustments" tenant={tenant}>
      <div className="workspace">
        <ModulePageHeader
          eyebrow="Inventory"
          title="Stock adjustments"
          lead="Quantity corrections with GL: Inventory (5100) vs General Expense (6800)."
          newHref="/inventory/adjustments/new"
          newLabel="New adjustment"
        />
        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            {rows.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <h3>No adjustments yet</h3>
                <p>Use adjustments for write-offs, counts, and opening corrections.</p>
                <div style={{ marginTop: 12 }}>
                  <Link href="/inventory/adjustments/new">
                    <Button variant="primary" type="button">New adjustment</Button>
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
