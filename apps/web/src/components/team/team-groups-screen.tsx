'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { addTeamMember, removeTeamMember, saveTeam, voidTeam } from '@/app/actions/team';
import { pushStatusToast } from '@/components/layout/status-toast';
import { Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { withFormPending } from '@/components/ui/form-busy';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { jobDescription } from '@/lib/job-descriptions';

type Job = { id: string; name: string; slug: string; templateKey: string | null };
type Person = { userId: string; name: string; email: string };
type Team = {
  id: string;
  name: string;
  roleId: string;
  roleName: string | null;
  members: { id: string; teamId: string; userId: string; name: string; email: string }[];
};

function GroupCard({ team, people }: { team: Team; people: Person[] }) {
  const router = useRouter();
  const [pick, setPick] = useState('');
  const [deleting, setDeleting] = useState(false);
  const candidates = people.filter((p) => !team.members.some((m) => m.userId === p.userId));

  async function run(fn: (fd: FormData) => Promise<unknown>, fields: Record<string, string>, ok: string) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    await withFormPending(() => fn(fd));
    pushStatusToast({ kind: 'success', message: ok });
    router.refresh();
  }

  return (
    <li className="grp-card">
      <div className="grp-head">
        <div>
          <strong>{team.name}</strong>
          <span>Extra job: {team.roleName ?? '—'}</span>
        </div>
        <Button type="button" variant="ghost" onClick={() => setDeleting(true)}>
          Delete group
        </Button>
      </div>
      <div className="grp-members">
        {team.members.length === 0 ? <span className="ux-muted">Nobody yet.</span> : null}
        {team.members.map((m) => (
          <span key={m.id} className="grp-chip">
            {m.name}
            <button
              type="button"
              aria-label={`Take ${m.name} out of ${team.name}`}
              onClick={() => void run(removeTeamMember, { teamId: team.id, userId: m.userId }, `${m.name} taken out of ${team.name}`)}
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
      </div>
      {candidates.length ? (
        <div className="grp-add">
          <SelectField
            id={`grp-add-${team.id}`}
            label="Add someone"
            value={pick}
            onChange={setPick}
            placeholder="Choose a person"
            options={candidates.map((p) => ({ value: p.userId, label: p.name, description: p.email }))}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!pick}
            onClick={() => {
              void run(addTeamMember, { teamId: team.id, userId: pick }, `Added to ${team.name}`);
              setPick('');
            }}
          >
            <Plus size={14} aria-hidden /> Add
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={deleting}
        title={`Delete the ${team.name} group?`}
        message={`The people in it lose the extra ${team.roleName ?? ''} job. Their main job does not change.`}
        confirmLabel="Delete group"
        tone="danger"
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          void run(voidTeam, { teamId: team.id }, 'Group deleted');
        }}
      />
    </li>
  );
}

/** Shared extra jobs: several people get one more job on top of their own. Shown inside People. */
export function TeamGroupsScreen({ teams, jobs, people }: { teams: Team[]; jobs: Job[]; people: Person[] }) {
  const router = useRouter();
  const groupJobs = jobs.filter((j) => j.templateKey !== 'owner' && j.templateKey !== 'admin' && j.slug !== 'owner' && j.slug !== 'admin');
  const [roleId, setRoleId] = useState(groupJobs.find((j) => j.slug === 'warehouse')?.id ?? groupJobs[0]?.id ?? '');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');

  async function create(fd: FormData) {
    setErr('');
    fd.set('roleId', roleId);
    const res = await withFormPending(() => saveTeam(fd));
    if (!res.ok) return setErr(res.error ?? 'Could not add group.');
    pushStatusToast({ kind: 'success', message: res.message ?? 'Group added' });
    setAdding(false);
    router.refresh();
  }

  return (
    <section className="ux-card" aria-labelledby="grp-title">
      <header className="ux-card-head">
        <h2 id="grp-title">Shared extra jobs (groups)</h2>
        {!adding ? (
          <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden /> New group
          </Button>
        ) : null}
      </header>
      <div className="ux-card-body">
        <p>
          Give several people one more job on top of their own, e.g. cashiers who also count stock. Owner and Admin cannot be
          shared.
        </p>
        {adding ? (
          <form action={create} className="grp-new">
            <TextField id="grp-name" name="name" label="Group name" required placeholder="Shop floor" />
            <SelectField
              id="grp-job"
              label="Extra job they all get"
              value={roleId}
              onChange={setRoleId}
              options={groupJobs.map((j) => ({ value: j.id, label: j.name, description: jobDescription(j) }))}
            />
            <div className="grp-new-foot">
              {err ? (
                <span className="form-error" role="alert">
                  {err}
                </span>
              ) : null}
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Add group
              </Button>
            </div>
          </form>
        ) : null}
        {teams.length === 0 && !adding ? <p className="ux-muted">No groups yet.</p> : null}
        {teams.length ? (
          <ul className="grp-list">
            {teams.map((t) => (
              <GroupCard key={t.id} team={t} people={people} />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
