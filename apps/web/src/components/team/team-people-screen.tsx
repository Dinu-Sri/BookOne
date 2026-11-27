'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { assignJob, deactivateMember, restoreMember } from '@/app/actions/team';
import { pushStatusToast } from '@/components/layout/status-toast';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { withFormPending } from '@/components/ui/form-busy';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { jobDescription } from '@/lib/job-descriptions';
import { TeamGroupsScreen } from '@/components/team/team-groups-screen';

type Person = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  status: string;
  role: string;
  jobName: string | null;
  jobSlug: string | null;
  extraName?: string | null;
};
type Job = { id: string; name: string; slug: string; templateKey: string | null };
type Invite = { id: string; email: string; status: string; expiresAt: Date; roleName: string | null };
type HistoryRow = {
  id: string;
  action: string;
  tableName: string;
  notes: string | null;
  createdAt: Date;
  actorName: string | null;
  actorEmail: string | null;
};
type Team = {
  id: string;
  name: string;
  roleId: string;
  roleName: string | null;
  members: { id: string; teamId: string; userId: string; name: string; email: string }[];
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

function AddPerson({
  jobs,
  createAction,
  inviteAction,
  onDone,
}: {
  jobs: Job[];
  createAction: (formData: FormData) => Promise<{ ok: boolean; error?: string; message?: string }>;
  inviteAction: (formData: FormData) => Promise<{ ok: boolean; error?: string; message?: string; url?: string }>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'invite' | 'password'>('invite');
  const [roleId, setRoleId] = useState(jobs.find((j) => j.slug === 'cashier')?.id ?? jobs[0]?.id ?? '');
  const [err, setErr] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const job = jobs.find((j) => j.id === roleId);

  async function submit(fd: FormData) {
    setErr('');
    fd.set('roleId', roleId);
    if (mode === 'invite') {
      const res = await withFormPending(() => inviteAction(fd));
      if (!res.ok) return setErr(res.error ?? 'Could not invite.');
      setInviteUrl(res.url ?? '');
      pushStatusToast({ kind: 'success', message: res.message ?? 'Invite created' });
    } else {
      const res = await withFormPending(() => createAction(fd));
      if (!res.ok) return setErr(res.error ?? 'Could not add this person.');
      pushStatusToast({ kind: 'success', message: res.message ?? 'Person added' });
      onDone();
    }
    router.refresh();
  }

  return (
    <section className="ux-card ppl-add" aria-labelledby="ppl-add-title">
      <header className="ux-card-head">
        <h2 id="ppl-add-title">Add a person</h2>
        <Button type="button" variant="ghost" onClick={onDone}>
          Close
        </Button>
      </header>
      <div className="ux-card-body">
        <div className="ppl-modes" role="radiogroup" aria-label="How they get in">
          <label className={mode === 'invite' ? 'is-on' : ''}>
            <input type="radio" name="ppl-mode" checked={mode === 'invite'} onChange={() => setMode('invite')} />
            <strong>Send an invite link</strong>
            <span>They choose their own password. Best for most people.</span>
          </label>
          <label className={mode === 'password' ? 'is-on' : ''}>
            <input type="radio" name="ppl-mode" checked={mode === 'password'} onChange={() => setMode('password')} />
            <strong>Set a password for them</strong>
            <span>For staff without email access. No email is sent.</span>
          </label>
        </div>
        <form action={submit} className="ppl-add-form">
          {mode === 'password' ? <TextField id="ppl-name" name="name" label="Name" required placeholder="Nimal Perera" /> : null}
          <TextField id="ppl-email" name="email" type="email" label="Email" required placeholder="nimal@shop.lk" />
          {mode === 'password' ? (
            <>
              <TextField id="ppl-pass" name="password" type="password" label="Password" required minLength={8} placeholder="At least 8 characters" />
              <TextField id="ppl-pass2" name="confirmPassword" type="password" label="Confirm password" required minLength={8} />
            </>
          ) : null}
          <SelectField
            id="ppl-job"
            label="Job"
            value={roleId}
            onChange={setRoleId}
            options={jobs.map((j) => ({ value: j.id, label: j.name, description: jobDescription(j) }))}
            help={job ? jobDescription(job) : undefined}
          />
          <div className="ppl-add-foot">
            {err ? (
              <span className="form-error" role="alert">
                {err}
              </span>
            ) : null}
            <Button type="submit" variant="primary">
              {mode === 'invite' ? 'Create invite link' : 'Add person'}
            </Button>
          </div>
        </form>
        {inviteUrl ? (
          <p className="ppl-invite-url">
            Copy this link and send it to them: <code>{inviteUrl}</code>
          </p>
        ) : null}
      </div>
    </section>
  );
}

function PersonRow({ p, jobs }: { p: Person; jobs: Job[] }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = jobs.find((j) => j.slug === p.jobSlug)?.id ?? '';
  const removed = p.status === 'disabled';
  const isOwner = p.jobSlug === 'owner' || p.role === 'owner';

  async function changeJob(roleId: string) {
    const fd = new FormData();
    fd.set('membershipId', p.membershipId);
    fd.set('roleId', roleId);
    await withFormPending(() => assignJob(fd));
    pushStatusToast({ kind: 'success', message: `${p.name}'s job changed` });
    router.refresh();
  }
  async function setRemoved(remove: boolean) {
    setBusy(true);
    const fd = new FormData();
    fd.set('membershipId', p.membershipId);
    const res = await withFormPending(() => (remove ? deactivateMember(fd) : restoreMember(fd)));
    setBusy(false);
    setConfirm(false);
    pushStatusToast({ kind: res.ok ? 'success' : 'error', message: res.ok ? (res.message ?? (remove ? 'Removed' : 'Restored')) : (res.error ?? 'Could not change this person.') });
    router.refresh();
  }

  return (
    <li className={`ppl-row${removed ? ' is-removed' : ''}`}>
      <span className="ppl-avatar" aria-hidden>
        {initials(p.name) || '?'}
      </span>
      <div className="ppl-who">
        <Link href={`/company/team/${p.userId}`}>
          <strong>{p.name}</strong>
        </Link>
        <span>{p.email}</span>
      </div>
      <div className="ppl-job">
        {isOwner || removed ? (
          <span className="ppl-job-fixed">
            <Badge tone={isOwner ? 'success' : 'neutral'}>{p.jobName ?? 'No job'}</Badge>
          </span>
        ) : (
          <SelectField
            id={`ppl-job-${p.membershipId}`}
            label={`Job for ${p.name}`}
            value={current}
            onChange={(v) => void changeJob(v)}
            options={jobs.filter((j) => j.slug !== 'owner').map((j) => ({ value: j.id, label: j.name, description: jobDescription(j) }))}
            className="ppl-job-select"
          />
        )}
        {p.extraName ? <span className="ppl-extra">Also: {p.extraName}</span> : null}
      </div>
      <div className="ppl-actions">
        {removed ? (
          <>
            <Badge tone="neutral">Removed</Badge>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void setRemoved(false)}>
              Restore
            </Button>
          </>
        ) : isOwner ? null : (
          <Button type="button" variant="ghost" onClick={() => setConfirm(true)}>
            Remove
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title={`Remove ${p.name}?`}
        message={`${p.name} can no longer sign in to this company. Their past work stays. You can restore them later from this list.`}
        confirmLabel="Remove"
        tone="danger"
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void setRemoved(true)}
      />
    </li>
  );
}

export function TeamPeopleScreen({
  people,
  jobs,
  invites,
  seats,
  history,
  teams = [],
  createAction,
  inviteAction,
  revokeAction,
}: {
  people: Person[];
  jobs: Job[];
  invites: Invite[];
  seats: { used: number; cap: number };
  history: HistoryRow[];
  teams?: Team[];
  createAction: (formData: FormData) => Promise<{ ok: boolean; error?: string; message?: string }>;
  inviteAction: (formData: FormData) => Promise<{ ok: boolean; error?: string; message?: string; url?: string }>;
  revokeAction: (formData: FormData) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const inviteJobs = jobs.filter((j) => j.templateKey !== 'owner' && j.slug !== 'owner');
  const full = seats.used >= seats.cap;

  return (
    <div className="ux-page ppl-page">
      <header className="ux-head">
        <div className="ux-head-text">
          <div>
            <h1 className="page-title">People</h1>
            <p>Who can sign in to this company, and the job each person does. A job decides what they can see and change.</p>
          </div>
        </div>
        <div className="ux-head-actions">
          <Badge tone={full ? 'warning' : 'neutral'}>
            {seats.used} of {seats.cap} seats used
          </Badge>
          <Button type="button" variant="primary" onClick={() => setAdding(true)} disabled={full}>
            <UserPlus size={15} aria-hidden /> Add a person
          </Button>
        </div>
      </header>

      <div className="ux-split">
        <div className="ux-main">
          {adding ? <AddPerson jobs={inviteJobs} createAction={createAction} inviteAction={inviteAction} onDone={() => setAdding(false)} /> : null}

          <section className="ux-card" aria-labelledby="ppl-list-title">
            <header className="ux-card-head">
              <h2 id="ppl-list-title">Everyone in this company</h2>
              <span>{people.filter((p) => p.status !== 'disabled').length} active</span>
            </header>
            {people.length === 1 ? (
              <p className="ppl-hint">You are the only person here. Add a cashier or accountant when you are ready.</p>
            ) : null}
            <ul className="ppl-list">
              {people.map((p) => (
                <PersonRow key={p.membershipId} p={p} jobs={jobs} />
              ))}
            </ul>
          </section>

          {invites.length ? (
            <section className="ux-card" aria-labelledby="ppl-inv-title">
              <header className="ux-card-head">
                <h2 id="ppl-inv-title">Waiting to accept an invite</h2>
                <span>{invites.length}</span>
              </header>
              <ul className="ppl-list">
                {invites.map((inv) => (
                  <li key={inv.id} className="ppl-row">
                    <span className="ppl-avatar is-pending" aria-hidden>
                      @
                    </span>
                    <div className="ppl-who">
                      <strong>{inv.email}</strong>
                      <span>
                        Job: {inv.roleName ?? '—'} · link expires {new Date(inv.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="ppl-actions">
                      <form action={revokeAction}>
                        <input type="hidden" name="id" value={inv.id} />
                        <Button variant="ghost" type="submit">
                          Cancel invite
                        </Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section id="groups" className="ppl-groups">
            <TeamGroupsScreen
              teams={teams}
              jobs={jobs}
              people={people.filter((p) => p.status !== 'disabled').map((p) => ({ userId: p.userId, name: p.name, email: p.email }))}
            />
          </section>

          <details className="ux-disclosure">
            <summary>
              Access history <span>{history.length}</span>
            </summary>
            {history.length === 0 ? (
              <p className="ux-muted">No access changes yet.</p>
            ) : (
              <ul className="ppl-history">
                {history.map((row) => (
                  <li key={row.id}>
                    <span>{row.createdAt ? new Date(row.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    <strong>{row.actorName || row.actorEmail || '—'}</strong>
                    <span>{row.notes || `${row.action} ${row.tableName}`.replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>

        <aside className="ux-guide" aria-label="How access works">
          <h2>How access works</h2>
          <ol>
            <li>
              <strong>One job each</strong>
              <span>Every person has one job, like Cashier or Accountant.</span>
            </li>
            <li>
              <strong>Jobs set the screens</strong>
              <span>A job decides which screens a person sees, and if they can change things. Adjust jobs on the Jobs tab.</span>
            </li>
            <li>
              <strong>Need a bit more?</strong>
              <span>Put people in a shared extra job below, e.g. cashiers who also do stock counts.</span>
            </li>
            <li>
              <strong>Owner can do everything</strong>
              <span>The owner always keeps full access and cannot be removed.</span>
            </li>
          </ol>
          <div className="ux-guide-links">
            <Link href="/company/team/jobs">Open Jobs</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
