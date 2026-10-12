import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { PermissionDeniedCard } from '@/components/layout/permission-denied-card';
import { PartyForm } from '@/components/parties/party-form';
import { jobCanWrite } from '@/lib/access';

export default async function NewVendorPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  if (!jobCanWrite(tenant, 'Vendors')) {
    return (
      <BookOneShell active="Vendors" tenant={tenant}>
        <PermissionDeniedCard
          title="Cannot create vendors"
          body="Your job can view vendors but cannot save them."
          backHref="/parties/vendors"
          backLabel="Back to vendors"
        />
      </BookOneShell>
    );
  }

  return (
    <BookOneShell active="Vendors" tenant={tenant}>
      <div className="workspace party-workspace">
        <PartyForm mode="create" roleContext="vendor" backHref="/parties/vendors" />
      </div>
    </BookOneShell>
  );
}
