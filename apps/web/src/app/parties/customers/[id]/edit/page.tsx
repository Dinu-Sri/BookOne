import { redirect } from 'next/navigation';
import { getParty } from '@/app/actions/parties';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { PermissionDeniedCard } from '@/components/layout/permission-denied-card';
import { PartyForm } from '@/components/parties/party-form';
import { jobCanWrite } from '@/lib/access';

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

  if (!jobCanWrite(tenant, 'Customers')) {
    return (
      <BookOneShell active="Customers" tenant={tenant}>
        <PermissionDeniedCard
          title="Cannot edit customers"
          body="Your job can view customers but cannot change them."
          backHref="/parties/customers"
          backLabel="Back to customers"
        />
      </BookOneShell>
    );
  }

  return (
    <BookOneShell active="Customers" tenant={tenant}>
      <div className="workspace party-workspace">
        <PartyForm mode="edit" roleContext="customer" party={party} backHref="/parties/customers" />
      </div>
    </BookOneShell>
  );
}
