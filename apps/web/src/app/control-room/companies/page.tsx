import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listPlatformCompanies } from '@/app/actions/platform';
import { getTenantInfo } from '@/app/actions/workspace';
import { CompaniesListScreen } from '@/components/control-room/companies-list';
import { BookOneShell } from '@/components/layout/bookone-shell';

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; plan?: string; environment?: string }>;
}) {
  const params = await searchParams;
  let tenant;
  let rows;
  try {
    tenant = await getTenantInfo();
    if (tenant.userRole !== 'super_admin' && tenant.userEmail !== 'dinu.sri.m@gmail.com') {
      redirect('/');
    }
    rows = await listPlatformCompanies({
      q: params.q,
      status: params.status,
      plan: params.plan,
      environment: params.environment,
    });
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Companies" tenant={tenant}>
      <Suspense fallback={<div className="workspace">Loading…</div>}>
        <CompaniesListScreen rows={rows} />
      </Suspense>
    </BookOneShell>
  );
}
