'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { assignJob, deactivateMember } from '@/app/actions/team';
import { Button, Card, CardBody, CardHeader } from '@/components/ui/bookone-ui';

type Person = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  status: string;
  role: string;
  jobName: string | null;
  jobSlug: string | null;
};
type Job = { id: string; name: string; slug: string; templateKey: string | null };
type Invite = { id: string; email: string; status: string; expiresAt: Date; roleName: string | null };

export function TeamPeopleScreen({
  people,
  jobs,
  invites,
  inviteAction,
  revokeAction,
}: {
  people: Person[];
  jobs: Job[];
  invites: Invite[];
  inviteAction: (formData: FormData) => Promise<{ ok: boolean; error?: string; message?: string; url?: string }>;
  revokeAction: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <CardHeader
          title="Who can use BookOne"
          subtitle="Invite people and give them a job. A job decides which screens they can view or edit."
        />
        <CardBody>
          <form
            className="company-inline-form is-create"
            action={async (fd) => {
              setErr('');
              setMsg('');
              const res = await inviteAction(fd);
              if (!res.ok) setErr(res.error ?? 'Could not invite.');
              else {
                setMsg(res.message ?? 'Invited.');
                setInviteUrl(res.url ?? '');
                router.refresh();
              }
            }}
          >
            <div className="field">
              <label>Email</label>
              <input className="input" name="email" type="email" required placeholder="nimal@shop.lk" />
            </div>
            <div className="field">
              <label>Job</label>
              <select className="input" name="roleId" required defaultValue={jobs.find((j) => j.slug === 'cashier')?.id ?? jobs[0]?.id}>
                {jobs.map((j) => (
                  <option value={j.id} key={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="company-form-footer field-full">
              {err ? <span className="form-error inline">{err}</span> : null}
              {msg ? <span className="entry-result success inline">{msg}</span> : null}
              <div className="company-form-footer-actions">
                <Button variant="primary" type="submit">
                  Send invite
                </Button>
              </div>
            </div>
            {inviteUrl ? (
              <p className="party-hint field-full">
                Invite link (copy and send): <code>{inviteUrl}</code>
              </p>
            ) : null}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="People" subtitle={`${people.length} in this workspace`} />
        <CardBody>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Job</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.membershipId}>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td>{p.email}</td>
                    <td>
                      <form
                        action={async (fd) => {
                          await assignJob(fd);
                          router.refresh();
                        }}
                      >
                        <input type="hidden" name="membershipId" value={p.membershipId} />
                        <select className="input" name="roleId" defaultValue={jobs.find((j) => j.slug === p.jobSlug)?.id ?? ''} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                          {jobs.map((j) => (
                            <option value={j.id} key={j.id}>
                              {j.name}
                            </option>
                          ))}
                        </select>
                      </form>
                    </td>
                    <td>{p.status}</td>
                    <td>
                      <form
                        action={async (fd) => {
                          await deactivateMember(fd);
                          router.refresh();
                        }}
                      >
                        <input type="hidden" name="membershipId" value={p.membershipId} />
                        <Button variant="secondary" type="submit">
                          Remove
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {invites.length ? (
        <Card>
          <CardHeader title="Pending invites" />
          <CardBody>
            <ul className="muted-line" style={{ display: 'grid', gap: 8 }}>
              {invites.map((inv) => (
                <li key={inv.id} className="cluster" style={{ justifyContent: 'space-between' }}>
                  <span>
                    {inv.email} · {inv.roleName}
                  </span>
                  <form action={revokeAction}>
                    <input type="hidden" name="id" value={inv.id} />
                    <Button variant="secondary" type="submit">
                      Revoke
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
