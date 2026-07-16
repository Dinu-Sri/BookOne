import { redirect } from 'next/navigation';
import { getParty } from '@/app/actions/parties';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { FormPageShell, formatLKR, StatusBadge } from '@/components/module/list-page';
import { PartyForm } from '@/components/parties/party-form';
import { Card } from '@/components/ui/bookone-ui';

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenant;
  let party;
  try {
    [tenant, party] = await Promise.all([getTenantInfo(), getParty(id)]);
  } catch {
    redirect('/login');
  }
  if (!party || !party.isCustomer) redirect('/parties/customers');

  return (
    <BookOneShell active="Customers" tenant={tenant}>
      <FormPageShell
        eyebrow="Parties"
        title={`Edit ${party.displayName || party.name}`}
        lead="Update tax, credit, banking, and roles. Role demotion is blocked when documents exist."
        backHref="/parties/customers"
      >
        <div className="grid metrics" style={{ marginBottom: 16 }}>
          <Card className="metric-card">
            <p className="metric-label">Open AR</p>
            <p className="metric-value">{formatLKR(party.openReceivable)}</p>
          </Card>
          <Card className="metric-card">
            <p className="metric-label">Open AP</p>
            <p className="metric-value">{formatLKR(party.openPayable)}</p>
          </Card>
          <Card className="metric-card">
            <p className="metric-label">Documents</p>
            <p className="metric-value">{party.documentCount}</p>
          </Card>
          <Card className="metric-card">
            <p className="metric-label">Delete</p>
            <p className="metric-note">
              {party.canDelete ? <StatusBadge status="active" /> : <StatusBadge status="blocked" />}
              {!party.canDelete ? (
                <span style={{ display: 'block', marginTop: 6 }}>{party.deleteReasons.join(' ')}</span>
              ) : (
                <span style={{ display: 'block', marginTop: 6 }}>Safe to soft-delete</span>
              )}
            </p>
          </Card>
        </div>
        <PartyForm mode="edit" roleContext="customer" party={party} />
      </FormPageShell>
    </BookOneShell>
  );
}
