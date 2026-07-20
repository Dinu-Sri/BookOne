import { notFound, redirect } from 'next/navigation';
import { getPlatformCompany } from '@/app/actions/platform';
import { getTenantInfo } from '@/app/actions/workspace';
import { CompanyEditForm } from '@/components/control-room/company-form';
import { BookOneShell } from '@/components/layout/bookone-shell';

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let tenant;
  let company;
  try {
    tenant = await getTenantInfo();
    if (tenant.userRole !== 'super_admin' && tenant.userEmail !== 'dinu.sri.m@gmail.com') {
      redirect('/');
    }
    company = await getPlatformCompany(id);
  } catch {
    redirect('/login');
  }

  if (!company) notFound();

  return (
    <BookOneShell active="Companies" tenant={tenant}>
      <div className="workspace party-workspace">
        <CompanyEditForm company={company} />
      </div>
    </BookOneShell>
  );
}
