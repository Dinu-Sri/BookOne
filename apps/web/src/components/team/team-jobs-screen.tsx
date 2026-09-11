'use client';

import { useRouter } from 'next/navigation';
import { Button, Card, CardBody, CardHeader } from '@/components/ui/bookone-ui';

type Job = { id: string; name: string; slug: string; templateKey: string | null; customizedAt: Date | null };
type Matrix = {
  role: { id: string; name: string; templateKey: string | null };
  screens: {
    keyPrefix: string;
    label: string;
    module: string;
    writeable: boolean;
    level: 'none' | 'read' | 'write';
    locked: boolean;
  }[];
};

export function TeamJobsScreen({
  jobs,
  matrix,
  saveAction,
}: {
  jobs: Job[];
  matrix: Matrix | null;
  saveAction: (formData: FormData) => Promise<{ ok: boolean; message?: string }>;
}) {
  const router = useRouter();
  const grouped = new Map<string, Matrix['screens']>();
  for (const s of matrix?.screens ?? []) {
    const list = grouped.get(s.module) ?? [];
    list.push(s);
    grouped.set(s.module, list);
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <CardHeader
          title="Jobs"
          subtitle="A job is a set of screens. Pick a person on Team, then choose their job. You can tweak a job here."
        />
        <CardBody>
          <div className="cluster" style={{ flexWrap: 'wrap', gap: 8 }}>
            {jobs.map((j) => (
              <Button
                key={j.id}
                variant={matrix?.role.id === j.id ? 'primary' : 'secondary'}
                type="button"
                onClick={() => router.push(`/company/team/jobs?role=${j.id}`)}
              >
                {j.name}
                {j.customizedAt ? ' •' : ''}
              </Button>
            ))}
          </div>
        </CardBody>
      </Card>

      {matrix ? (
        <Card>
          <CardHeader title={matrix.role.name} subtitle="No access / View only / Can edit. Locked rows are Owner or Admin only." />
          <CardBody>
            <form
              action={async (fd) => {
                await saveAction(fd);
                router.refresh();
              }}
            >
              <input type="hidden" name="roleId" value={matrix.role.id} />
              {[...grouped.entries()].map(([mod, screens]) => (
                <div key={mod} style={{ marginBottom: 18 }}>
                  <h3 className="card-title" style={{ fontSize: 14, textTransform: 'capitalize' }}>
                    {mod}
                  </h3>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Screen</th>
                          <th>Access</th>
                        </tr>
                      </thead>
                      <tbody>
                        {screens.map((s) => (
                          <tr key={s.keyPrefix}>
                            <td>{s.label}</td>
                            <td>
                              <select
                                className="input"
                                name={`perm_${s.keyPrefix}`}
                                defaultValue={s.level}
                                disabled={s.locked}
                              >
                                <option value="none">No access</option>
                                <option value="read">View only</option>
                                {s.writeable ? <option value="write">Can edit</option> : null}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              <div className="company-form-footer">
                <div className="company-form-footer-actions">
                  <Button variant="primary" type="submit">
                    Save job
                  </Button>
                </div>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
