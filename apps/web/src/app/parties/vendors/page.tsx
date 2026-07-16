import { redirect } from 'next/navigation';
import Link from 'next/link';
import { listParties } from '@/app/actions/parties';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { formatLKR, ModulePageHeader, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

export default async function VendorsPage() {
  let tenant;
  let parties;
  try {
    [tenant, parties] = await Promise.all([getTenantInfo(), listParties({ kind: 'vendor' })]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Vendors" tenant={tenant}>
      <div className="workspace">
        <ModulePageHeader
          eyebrow="Parties"
          title="Vendors"
          lead="Supplier directory for purchase orders, bills, and payables."
          newHref="/parties/vendors/new"
          newLabel="New vendor"
        />
        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            {parties.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <h3>No vendors yet</h3>
                <p>Add suppliers before creating purchase orders and bills.</p>
                <div style={{ marginTop: 12 }}>
                  <Link href="/parties/vendors/new">
                    <Button variant="primary" type="button">New vendor</Button>
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
