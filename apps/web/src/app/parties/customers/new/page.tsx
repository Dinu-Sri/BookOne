import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { PermissionDeniedCard } from '@/components/layout/permission-denied-card';
import { PartyForm } from '@/components/parties/party-form';
import { jobCanWrite } from '@/lib/access';

export default async function NewCustomerPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  if (!jobCanWrite(tenant, 'Customers')) {
    return (
      <BookOneShell active="Customers" tenant={tenant}>
        <PermissionDeniedCard
          title="Cannot create customers"
          body="Your job can view customers but cannot save them."
          backHref="/parties/customers"
          backLabel="Back to customers"
        />
      </BookOneShell>
    );
  }

  return (
    <BookOneShell active="Customers" tenant={tenant}>
      <div className="workspace party-workspace">
        <PartyForm mode="create" roleContext="customer" backHref="/parties/customers" />
      </div>
    </BookOneShell>
  );
}
