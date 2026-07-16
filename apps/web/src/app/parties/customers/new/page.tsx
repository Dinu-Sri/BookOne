import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
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
      <div className="workspace party-workspace">
        <PartyForm mode="create" roleContext="customer" backHref="/parties/customers" />
      </div>
    </BookOneShell>
  );
}
