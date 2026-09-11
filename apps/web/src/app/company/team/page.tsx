import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { getSeatUsage, inviteTeamMember, listAccessHistory, listPendingInvites, listTeamJobs, listTeamPeople, revokeInvite } from '@/app/actions/team';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { TeamPeopleScreen } from '@/components/team/team-people-screen';

export default async function TeamPeoplePage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }
  if (tenant.entityKind === 'personal') redirect('/cashbook');
  const [people, jobs, invites, seats, history] = await Promise.all([
    listTeamPeople(),
    listTeamJobs(),
    listPendingInvites(),
    getSeatUsage(),
    listAccessHistory(),
  ]);

  return (
    <BookOneShell active="Team" tenant={tenant}>
      <div className="workspace">
        <TeamPeopleScreen
          people={people}
          jobs={jobs}
          invites={invites}
          seats={seats}
          history={history}
          inviteAction={inviteTeamMember}
          revokeAction={revokeInvite}
        />
      </div>
    </BookOneShell>
  );
}
