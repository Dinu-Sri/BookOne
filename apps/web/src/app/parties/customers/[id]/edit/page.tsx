import { redirect } from 'next/navigation';
import { getParty } from '@/app/actions/parties';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { PartyForm } from '@/components/parties/party-form';

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
      <div className="workspace party-workspace">
        <PartyForm mode="edit" roleContext="customer" party={party} backHref="/parties/customers" />
      </div>
    </BookOneShell>
  );
}
