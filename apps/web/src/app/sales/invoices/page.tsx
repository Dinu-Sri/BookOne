import { redirect } from 'next/navigation';
import Link from 'next/link';
import { listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

export default async function SalesInvoicesPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([
      getTenantInfo(),
      listCommercialDocuments(['sales_invoice', 'customer_invoice']),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Sales Invoices" tenant={tenant}>
      <div className="workspace party-workspace">
        <div className="party-toolbar">
          <div className="party-search-form">
            <span
              className="input party-search"
              style={{ display: 'flex', alignItems: 'center', color: 'var(--ink-muted)' }}
            >
              Invoices post to the ledger · Tax invoices use IRD print layout
            </span>
          </div>
          <Link href="/sales/invoices/new">
            <Button variant="primary" type="button">
              New invoice
            </Button>
          </Link>
        </div>
        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            {rows.length === 0 ? (
              <div className="empty-state" style={{ padding: 28 }}>
                <h3>No sales invoices yet</h3>
                <p>Create directly or convert from sales orders (dispatch notes).</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Kind</th>
                      <th>Customer</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Total</th>
                      <th>Balance</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.taxInvoiceNumber || row.documentNumber}</strong>
                          {row.taxInvoiceNumber ? (
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{row.documentNumber}</div>
                          ) : null}
                        </td>
                        <td>
                          {row.invoiceKind === 'tax_invoice' ? 'TAX INVOICE' : 'Commercial'}
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                            {row.saleChannel === 'export' ? 'Export' : 'Local'}
                          </div>
                        </td>
                        <td>{row.partyName}</td>
                        <td>{row.issueDate}</td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
                        <td>{formatLKR(row.total)}</td>
                        <td>{formatLKR(row.balanceDue)}</td>
                        <td>
                          <Link href={`/sales/invoices/${row.id}/print`}>
                            <Button variant="secondary" type="button">
                              Print
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
