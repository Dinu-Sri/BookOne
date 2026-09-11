import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { getPersonAccess, listTeamJobs } from '@/app/actions/team';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { TeamPersonScreen } from '@/components/team/team-person-screen';

export default async function TeamPersonPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }
  if (tenant.entityKind === 'personal') redirect('/cashbook');
  const [data, jobs] = await Promise.all([getPersonAccess(userId), listTeamJobs()]);
  if (!data) redirect('/company/team');

  return (
    <BookOneShell active="Team" tenant={tenant}>
      <div className="workspace">
        <TeamPersonScreen data={data} jobs={jobs} />
      </div>
    </BookOneShell>
  );
}
