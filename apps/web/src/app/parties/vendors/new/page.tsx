import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { FormPageShell } from '@/components/module/list-page';
import { PartyForm } from '@/components/parties/party-form';

export default async function NewVendorPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Vendors" tenant={tenant}>
      <FormPageShell
        eyebrow="Parties"
        title="New vendor"
        lead="Supplier master with bank details and tax IDs. Check Customer if they also buy from you."
        backHref="/parties/vendors"
      >
        <PartyForm mode="create" roleContext="vendor" />
      </FormPageShell>
    </BookOneShell>
  );
}
