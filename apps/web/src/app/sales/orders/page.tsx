import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  convertDocumentAction,
  convertMultipleOrdersToInvoice,
  listCommercialDocuments,
} from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

export default async function SalesOrdersPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listCommercialDocuments(['sales_order'])]);
  } catch {
    redirect('/login');
  }

  const openRows = rows.filter((r) => r.status !== 'fully_invoiced' && r.status !== 'converted');

  return (
    <BookOneShell active="Sales Orders" tenant={tenant}>
      <div className="workspace party-workspace">
        <div className="party-toolbar">
          <div className="party-search-form">
            <input
              className="input party-search"
              placeholder="Search sales orders…"
              aria-label="Search"
              disabled
            />
          </div>
          <Link href="/sales/orders/new">
            <Button variant="primary" type="button">
              New sales order
            </Button>
          </Link>
        </div>

        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            {rows.length === 0 ? (
              <div className="empty-state" style={{ padding: 28 }}>
                <h3>No sales orders yet</h3>
                <p>Create from a quotation or add a dispatch note directly.</p>
              </div>
            ) : (
              <>
                <form action={convertMultipleOrdersToInvoice} id="multi-order-invoice-form">
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th />
                          <th>Number</th>
                          <th>Customer</th>
                          <th>Date</th>
                          <th>Status</th>
                          <th>Total</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const canInvoice =
                            row.status !== 'fully_invoiced' && row.status !== 'converted';
                          return (
                            <tr key={row.id}>
                              <td>
                                {canInvoice ? (
                                  <input type="checkbox" name="orderIds" value={row.id} />
                                ) : null}
                              </td>
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
                                {canInvoice ? (
                                  <Button
                                    variant="secondary"
                                    type="submit"
                                    form={`convert-order-${row.id}`}
                                  >
                                    To invoice
                                  </Button>
                                ) : (
                                  <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {openRows.length > 0 ? (
                    <div className="party-pagination">
                      <span>Select same-customer orders → one invoice</span>
                      <Button variant="primary" type="submit">
                        Create invoice from selected
                      </Button>
                    </div>
                  ) : null}
                </form>

                {openRows.map((row) => (
                  <form
                    key={row.id}
                    id={`convert-order-${row.id}`}
                    action={convertDocumentAction}
                    hidden
                  >
                    <input type="hidden" name="sourceId" value={row.id} />
                    <input type="hidden" name="targetType" value="sales_invoice" />
                  </form>
                ))}
              </>
            )}
          </div>
        </Card>
      </div>
    </BookOneShell>
  );
}
