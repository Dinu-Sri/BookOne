'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addTeamMember, removeTeamMember, saveTeam, voidTeam } from '@/app/actions/team';
import { Button, Card, CardBody, CardHeader } from '@/components/ui/bookone-ui';

type Job = { id: string; name: string; slug: string; templateKey: string | null };
type Person = { userId: string; name: string; email: string };
type Team = {
  id: string;
  name: string;
  roleId: string;
  roleName: string | null;
  members: { id: string; teamId: string; userId: string; name: string; email: string }[];
};

export function TeamGroupsScreen({
  teams,
  jobs,
  people,
}: {
  teams: Team[];
  jobs: Job[];
  people: Person[];
}) {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const groupJobs = jobs.filter((j) => j.templateKey !== 'owner' && j.templateKey !== 'admin' && j.slug !== 'owner' && j.slug !== 'admin');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <CardHeader
          title="Groups"
          subtitle="A group gives several people the same extra job. Groups cannot be Owner or Admin."
        />
        <CardBody>
          <form
            className="company-inline-form is-create"
            action={async (fd) => {
              setErr('');
              setMsg('');
              const res = await saveTeam(fd);
              if (!res.ok) setErr(res.error ?? 'Could not add group.');
              else {
                setMsg(res.message ?? 'Group added.');
                router.refresh();
              }
            }}
          >
            <div className="field">
              <label>Group name</label>
              <input className="input" name="name" required placeholder="Shop floor" />
            </div>
            <div className="field">
              <label>Job they share</label>
              <select className="input" name="roleId" required defaultValue={groupJobs.find((j) => j.slug === 'cashier')?.id ?? groupJobs[0]?.id}>
                {groupJobs.map((j) => (
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
                  Add group
                </Button>
              </div>
            </div>
          </form>
        </CardBody>
      </Card>

      {teams.length === 0 ? (
        <Card>
          <CardBody>
            <p className="muted-line">No groups yet. Add one when two people should share the same extra job.</p>
          </CardBody>
        </Card>
      ) : (
        teams.map((team) => (
          <Card key={team.id}>
            <CardHeader title={team.name} subtitle={`Shares the ${team.roleName ?? 'job'} extra job`} />
            <CardBody>
              {people.filter((p) => !team.members.some((m) => m.userId === p.userId)).length ? (
              <form
                className="company-inline-form is-create"
                action={async (fd) => {
                  await addTeamMember(fd);
                  router.refresh();
                }}
              >
                <input type="hidden" name="teamId" value={team.id} />
                <div className="field">
                  <label>Add person</label>
                  <select className="input" name="userId" required>
                    {people
                      .filter((p) => !team.members.some((m) => m.userId === p.userId))
                      .map((p) => (
                        <option value={p.userId} key={p.userId}>
                          {p.name} · {p.email}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="company-form-footer field-full">
                  <div className="company-form-footer-actions">
                    <Button variant="secondary" type="submit">
                      Add to group
                    </Button>
                  </div>
                </div>
              </form>
              ) : (
                <p className="muted-line">Everyone in this company is already in the group.</p>
              )}

              {team.members.length ? (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {team.members.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <strong>{m.name}</strong>
                          </td>
                          <td>{m.email}</td>
                          <td>
                            <form
                              action={async (fd) => {
                                await removeTeamMember(fd);
                                router.refresh();
                              }}
                            >
                              <input type="hidden" name="teamId" value={team.id} />
                              <input type="hidden" name="userId" value={m.userId} />
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
              ) : (
                <p className="muted-line" style={{ marginTop: 12 }}>
                  Nobody in this group yet.
                </p>
              )}

              <form
                style={{ marginTop: 12 }}
                action={async (fd) => {
                  await voidTeam(fd);
                  router.refresh();
                }}
              >
                <input type="hidden" name="teamId" value={team.id} />
                <Button variant="secondary" type="submit">
                  Delete group
                </Button>
              </form>
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}
