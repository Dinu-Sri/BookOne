import { redirect } from 'next/navigation';
import Link from 'next/link';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

export default async function PosHistoryPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listCommercialDocuments(['pos_sale'])]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="POS" tenant={tenant}>
      <div className="workspace party-workspace">
        <div className="party-toolbar">
          <div className="party-search-form">
            <input className="input party-search" placeholder="POS ticket history…" disabled />
          </div>
          <Link href="/pos">
            <Button variant="primary" type="button">
              Open POS terminal
            </Button>
          </Link>
        </div>
        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            {rows.length === 0 ? (
              <div className="empty-state" style={{ padding: 28 }}>
                <h3>No POS sales yet</h3>
                <p>Open the full-screen terminal to take payments.</p>
                <div style={{ marginTop: 12 }}>
                  <Link href="/pos">
                    <Button variant="primary" type="button">
                      Open POS terminal
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Customer</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.documentNumber}</strong>
                        </td>
                        <td>{row.partyName}</td>
                        <td>{row.issueDate}</td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
                        <td>{formatLKR(row.total)}</td>
                        <td>
                          <Link href={`/pos/receipt/${row.id}`}>
                            <Button variant="secondary" type="button">
                              Receipt
                            </Button>
                          </Link>
                        </td>
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
