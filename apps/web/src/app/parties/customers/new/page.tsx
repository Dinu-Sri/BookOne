import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { FormPageShell } from '@/components/module/list-page';
import { PartyForm } from '@/components/parties/party-form';

export default async function NewCustomerPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Customers" tenant={tenant}>
      <FormPageShell
        eyebrow="Parties"
        title="New customer"
        lead="Sri Lanka–ready customer master: tax IDs, address, credit terms. Check Vendor if they also supply you."
        backHref="/parties/customers"
      >
        <PartyForm mode="create" roleContext="customer" />
      </FormPageShell>
    </BookOneShell>
  );
}
