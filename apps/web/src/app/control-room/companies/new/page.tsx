import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { CompanyCreateForm } from '@/components/control-room/company-form';
import { BookOneShell } from '@/components/layout/bookone-shell';

export default async function NewCompanyPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }
  if (tenant.userRole !== 'super_admin' && tenant.userEmail !== 'dinu.sri.m@gmail.com') {
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
