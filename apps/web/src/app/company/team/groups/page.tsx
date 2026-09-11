import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { listTeamJobs, listTeamPeople, listTeamsWithMembers } from '@/app/actions/team';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { TeamGroupsScreen } from '@/components/team/team-groups-screen';

export default async function TeamGroupsPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }
  if (tenant.entityKind === 'personal') redirect('/cashbook');
  const [teams, jobs, people] = await Promise.all([listTeamsWithMembers(), listTeamJobs(), listTeamPeople()]);

  return (
    <BookOneShell active="Groups" tenant={tenant}>
      <div className="workspace">
        <TeamGroupsScreen
          teams={teams}
          jobs={jobs}
          people={people.map((p) => ({ userId: p.userId, name: p.name, email: p.email }))}
        />
      </div>
    </BookOneShell>
  );
}
