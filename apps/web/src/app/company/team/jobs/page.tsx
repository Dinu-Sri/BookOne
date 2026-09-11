import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { listJobMatrix, listTeamJobs, saveJobMatrix } from '@/app/actions/team';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { TeamJobsScreen } from '@/components/team/team-jobs-screen';

export default async function TeamJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }
  if (tenant.entityKind === 'personal') redirect('/cashbook');
  const params = await searchParams;
  const jobs = await listTeamJobs();
  const roleId = params.role || jobs.find((j) => j.slug === 'cashier')?.id || jobs[0]?.id || '';
  const matrix = roleId ? await listJobMatrix(roleId) : null;

  return (
    <BookOneShell active="Jobs" tenant={tenant}>
      <div className="workspace">
        <TeamJobsScreen jobs={jobs} matrix={matrix} saveAction={saveJobMatrix} />
      </div>
    </BookOneShell>
  );
}
