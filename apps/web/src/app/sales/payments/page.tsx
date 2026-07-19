import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listOpenArInvoices } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

export default async function ReceivePaymentsListPage() {
  let tenant;
  let invoices;
  try {
    [tenant, invoices] = await Promise.all([getTenantInfo(), listOpenArInvoices()]);
  } catch {
    redirect('/login');
  }

  const openTotal = invoices.reduce((s, i) => s + i.balanceDue, 0);

  return (
    <BookOneShell active="Receive Payments" tenant={tenant}>
      <Suspense fallback={<div className="workspace party-workspace">Loading…</div>}>
        <div className="workspace party-workspace">
          <div className="party-toolbar">
            <div className="party-search-form">
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)' }}>
                Open AR · {formatLKR(openTotal)} · {invoices.length} invoice
                {invoices.length === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/sales/aging">
                <Button variant="secondary" type="button">
                  AR aging
                </Button>
              </Link>
              <Link href="/sales/payments/new">
                <Button variant="primary" type="button">
                  Receive payment
                </Button>
              </Link>
            </div>
          </div>

          <Card>
            <div className="card-body" style={{ padding: 0 }}>
              {invoices.length === 0 ? (
                <div className="empty-state" style={{ padding: 28 }}>
                  <h3>No unpaid invoices</h3>
                  <p style={{ marginTop: 6 }}>
                    Create a sales invoice to open accounts receivable, then receive payment here.
                  </p>
                  <div style={{ marginTop: 12 }}>
                    <Link href="/sales/invoices/new">
                      <Button variant="primary" type="button">
                        New invoice
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
                        <th>Due</th>
                        <th>Status</th>
                        <th>Balance</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id}>
                          <td>
                            <Link href={`/sales/invoices/${inv.id}`}>
                              <strong>{inv.documentNumber}</strong>
                            </Link>
                          </td>
                          <td>{inv.partyName}</td>
                          <td>{inv.issueDate}</td>
                          <td>{inv.dueDate || '—'}</td>
                          <td>
                            <StatusBadge status={inv.status} />
                          </td>
                          <td>{formatLKR(inv.balanceDue)}</td>
                          <td>
                            <Link href={`/sales/payments/new?documentId=${inv.id}`}>
                              <Button variant="secondary" type="button">
                                Receive
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
