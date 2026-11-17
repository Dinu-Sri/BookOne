'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardBody, CardHeader } from '@/components/ui/bookone-ui';
import { TEAM_SOD_MESSAGE } from '@/lib/team-sod';

type Job = { id: string; name: string; slug: string; templateKey: string | null; customizedAt: Date | null };
type Matrix = {
  role: { id: string; name: string; templateKey: string | null };
  sod?: boolean;
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
  const roleId = matrix?.role.id ?? '';
  const roleRevision = matrix ? `${matrix.role.id}:${matrix.screens.map((s) => `${s.keyPrefix}:${s.level}`).join('|')}` : '';
  const [levels, setLevels] = useState<Record<string, 'none' | 'read' | 'write'>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const next: Record<string, 'none' | 'read' | 'write'> = {};
    for (const s of matrix?.screens ?? []) next[s.keyPrefix] = s.level;
    setLevels(next);
    setDirty(false);
  }, [roleId, roleRevision, matrix]);

  const grouped = useMemo(() => {
    const map = new Map<string, Matrix['screens']>();
    for (const s of matrix?.screens ?? []) {
      const list = map.get(s.module) ?? [];
      list.push(s);
      map.set(s.module, list);
    }
    return map;
  }, [matrix]);

  function selectRole(id: string) {
    if (id === roleId) return;
    if (dirty && !window.confirm('You have unsaved job changes. Leave this job without saving?')) return;
    router.push(`/company/team/jobs?role=${id}`);
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
                onClick={() => selectRole(j.id)}
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
            {matrix.sod ? <p className="team-sod">{TEAM_SOD_MESSAGE}</p> : null}
            {dirty ? (
              <p role="status" style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>
                Unsaved changes on this job. Save before switching jobs.
              </p>
            ) : null}
            <form
              key={roleId}
              action={async (fd) => {
                await saveAction(fd);
                setDirty(false);
                router.refresh();
              }}
            >
              <input type="hidden" name="roleId" value={roleId} />
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
                                value={levels[s.keyPrefix] ?? s.level}
                                disabled={s.locked}
                                aria-label={`${s.label} access for ${matrix.role.name}`}
                                onChange={(e) => {
                                  const value = e.target.value as 'none' | 'read' | 'write';
                                  setLevels((prev) => ({ ...prev, [s.keyPrefix]: value }));
                                  setDirty(true);
                                }}
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
