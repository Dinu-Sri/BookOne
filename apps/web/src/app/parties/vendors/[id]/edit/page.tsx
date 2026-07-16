import { redirect } from 'next/navigation';
import { getParty } from '@/app/actions/parties';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { PartyForm } from '@/components/parties/party-form';

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

  return (
    <BookOneShell active="Vendors" tenant={tenant}>
      <div className="workspace party-workspace">
        <PartyForm mode="edit" roleContext="vendor" party={party} backHref="/parties/vendors" />
      </div>
    </BookOneShell>
  );
}
