import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listOpenApBills } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

export default async function PayVendorsListPage() {
  let tenant;
  let bills;
  try {
    [tenant, bills] = await Promise.all([getTenantInfo(), listOpenApBills()]);
  } catch {
    redirect('/login');
  }

  const openTotal = bills.reduce((s, b) => s + b.balanceDue, 0);

  return (
    <BookOneShell active="Pay Vendors" tenant={tenant}>
      <Suspense fallback={<div className="workspace party-workspace">Loading…</div>}>
        <div className="workspace party-workspace">
          <div className="party-toolbar">
            <div className="party-search-form">
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)' }}>
                Open AP · {formatLKR(openTotal)} · {bills.length} bill{bills.length === 1 ? '' : 's'}
              </span>
            </div>
            <Link href="/purchase/payments/new">
              <Button variant="primary" type="button">
                Pay vendors
              </Button>
            </Link>
          </div>

          <Card>
            <div className="card-body" style={{ padding: 0 }}>
              {bills.length === 0 ? (
                <div className="empty-state" style={{ padding: 28 }}>
                  <h3>No unpaid bills</h3>
                  <p style={{ marginTop: 6 }}>
                    Create a purchase or import purchase to open accounts payable, then pay from here.
                  </p>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <Link href="/purchase/purchases/new">
                      <Button variant="primary" type="button">
                        New purchase
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
                        <th>Vendor</th>
                        <th>Date</th>
                        <th>Due</th>
                        <th>Status</th>
                        <th>Balance</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {bills.map((b) => (
                        <tr key={b.id}>
                          <td>
                            <Link href={`/purchase/purchases/${b.id}`}>
                              <strong>{b.documentNumber}</strong>
                            </Link>
                          </td>
                          <td>{b.partyName}</td>
                          <td>{b.issueDate}</td>
                          <td>{b.dueDate || '—'}</td>
                          <td>
                            <StatusBadge status={b.status} />
                          </td>
                          <td>{formatLKR(b.balanceDue)}</td>
                          <td>
                            <Link href={`/purchase/payments/new?documentId=${b.id}`}>
                              <Button variant="secondary" type="button">
                                Pay
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
      </Suspense>
    </BookOneShell>
  );
}
