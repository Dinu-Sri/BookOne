import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { isPlatformAdmin } from '@/lib/platform-admin';
import { CompanyCreateForm } from '@/components/control-room/company-form';
import { BookOneShell } from '@/components/layout/bookone-shell';

export default async function NewCompanyPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }
  if (!isPlatformAdmin(tenant)) {
    redirect('/');
  }

  return (
    <BookOneShell active="Companies" tenant={tenant}>
      <div className="workspace party-workspace">
        <CompanyCreateForm />
      </div>
    </BookOneShell>
  );
}
