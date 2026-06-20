import { redirect } from 'next/navigation';
import { createPartyFromForm, listParties } from '@/app/actions/parties';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button, Card, PageHeading } from '@/components/ui/bookone-ui';
import { Building2, Mail, Phone, Users } from 'lucide-react';

export default async function PartiesPage() {
  let tenant;
  let parties;
  try {
    [tenant, parties] = await Promise.all([getTenantInfo(), listParties()]);
  } catch {
    redirect('/login');
  }

  const customerCount = parties.filter((party) => party.kind === 'customer' || party.kind === 'both').length;
  const vendorCount = parties.filter((party) => party.kind === 'vendor' || party.kind === 'both').length;

  return (
    <BookOneShell active="Parties" tenant={tenant}>
      <div className="workspace">
        <PageHeading
          eyebrow="Contacts"
          title="Customers & Vendors"
          lead="Reusable parties replace repeated free-text names and prepare BookOne for invoices, bills, allocations, and aging reports."
        />

        <div className="grid two">
          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">New party</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Create customer/vendor</h2>
              </div>
              <Badge tone="info"><Users size={12} /> {parties.length} saved</Badge>
            </div>
            <div className="card-body">
              <form action={createPartyFromForm} className="form-grid">
                <div className="field field-full">
                  <label>Name</label>
                  <input className="input" name="name" placeholder="Customer or supplier name" required />
                </div>
                <div className="field">
                  <label>Type</label>
                  <select className="input" name="kind" defaultValue="customer">
                    <option value="customer">Customer</option>
                    <option value="vendor">Vendor</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input className="input" name="phone" placeholder="+94..." />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input className="input" name="email" type="email" placeholder="name@example.com" />
                </div>
                <div className="field">
                  <label>Address</label>
                  <input className="input" name="address" placeholder="Optional address" />
                </div>
                <div className="field field-full">
                  <Button variant="primary" type="submit">Save party</Button>
                </div>
              </form>
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">Directory</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Party register</h2>
              </div>
              <div className="cluster">
                <Badge tone="success">{customerCount} customers</Badge>
                <Badge tone="warning">{vendorCount} vendors</Badge>
              </div>
            </div>
            <div className="card-body">
              {parties.length === 0 ? (
                <div className="empty-state">
                  <Users size={24} color="var(--ink-soft)" />
                  <h3>No parties yet</h3>
                  <p>Create customers and vendors here, or let invoices and bills create them automatically.</p>
                </div>
              ) : (
                <div className="balance-list">
                  {parties.map((party) => (
                    <div className="balance-row" key={party.id}>
                      <div>
                        <strong>{party.name}</strong>
                        <span className="cluster" style={{ marginTop: 4 }}>
                          <Building2 size={12} /> {party.kind}
                          {party.email ? <><Mail size={12} /> {party.email}</> : null}
                          {party.phone ? <><Phone size={12} /> {party.phone}</> : null}
                        </span>
                      </div>
                      <Badge tone={party.kind === 'vendor' ? 'warning' : party.kind === 'both' ? 'info' : 'success'}>
                        {party.kind}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </BookOneShell>
  );
}
