import { redirect } from 'next/navigation';
import { listParties } from '@/app/actions/parties';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { formatLKR, ModulePageHeader, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';
import Link from 'next/link';

export default async function CustomersPage() {
  let tenant;
  let parties;
  try {
    [tenant, parties] = await Promise.all([getTenantInfo(), listParties({ kind: 'customer' })]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Customers" tenant={tenant}>
      <div className="workspace">
        <ModulePageHeader
          eyebrow="Parties"
          title="Customers"
          lead="Customer directory for sales documents, receivables, and relationship tracking."
          newHref="/parties/customers/new"
          newLabel="New customer"
        />
        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            {parties.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <h3>No customers yet</h3>
                <p>Add your first customer to start quotations and invoices.</p>
                <div style={{ marginTop: 12 }}>
                  <Link href="/parties/customers/new">
                    <Button variant="primary" type="button">New customer</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Code</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Open balance</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parties.map((p) => (
                      <tr key={p.id}>
                        <td><strong>{p.name}</strong></td>
                        <td>{p.code ?? '—'}</td>
                        <td>{p.phone ?? '—'}</td>
                        <td>{p.email ?? '—'}</td>
                        <td>{formatLKR(p.openBalance)}</td>
                        <td><StatusBadge status={p.kind} /></td>
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
