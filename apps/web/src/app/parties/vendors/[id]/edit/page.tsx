import { redirect } from 'next/navigation';
import { getParty } from '@/app/actions/parties';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { PermissionDeniedCard } from '@/components/layout/permission-denied-card';
import { PartyForm } from '@/components/parties/party-form';
import { jobCanWrite } from '@/lib/access';

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenant;
  let party;
  try {
    [tenant, party] = await Promise.all([getTenantInfo(), getParty(id)]);
  } catch {
    redirect('/login');
  }
  if (!party || !party.isVendor) redirect('/parties/vendors');

  if (!jobCanWrite(tenant, 'Vendors')) {
    return (
      <BookOneShell active="Vendors" tenant={tenant}>
        <PermissionDeniedCard
          title="Cannot edit vendors"
          body="Your job can view vendors but cannot change them."
          backHref="/parties/vendors"
          backLabel="Back to vendors"
        />
      </BookOneShell>
    );
  }

  return (
    <BookOneShell active="Vendors" tenant={tenant}>
      <div className="workspace party-workspace">
        <PartyForm mode="edit" roleContext="vendor" party={party} backHref="/parties/vendors" />
      </div>
    </BookOneShell>
  );
}
