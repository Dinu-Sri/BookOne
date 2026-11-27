'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { pushStatusToast } from '@/components/layout/status-toast';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { withFormPending } from '@/components/ui/form-busy';
import { jobDescription } from '@/lib/job-descriptions';
import { TEAM_SOD_MESSAGE } from '@/lib/team-sod';

import { askConfirm } from '@/components/ui/ask';
type Job = { id: string; name: string; slug: string; templateKey: string | null; customizedAt: Date | null };
type Level = 'none' | 'read' | 'write';
type Matrix = {
  role: { id: string; name: string; templateKey: string | null };
  sod?: boolean;
  screens: {
    keyPrefix: string;
    label: string;
    module: string;
    writeable: boolean;
    level: Level;
    locked: boolean;
  }[];
};

const MODULE_LABEL: Record<string, string> = {
  accounting: 'Accounting',
  parties: 'Customers and suppliers',
  sales: 'Sales',
  pos: 'Shop till (POS)',
  purchase: 'Purchase',
  inventory: 'Stock',
  rental: 'Rental',
  company: 'Company settings',
  team: 'People and jobs',
};

const LEVELS: Array<{ v: Level; label: string }> = [
  { v: 'none', label: 'No access' },
  { v: 'read', label: 'View' },
  { v: 'write', label: 'Edit' },
];

export function TeamJobsScreen({
  jobs,
  matrix,
  saveAction,
  peopleByJob = {},
}: {
  jobs: Job[];
  matrix: Matrix | null;
  saveAction: (formData: FormData) => Promise<{ ok: boolean; message?: string }>;
  /** Number of people per job slug. */
  peopleByJob?: Record<string, number>;
}) {
  const router = useRouter();
  const roleId = matrix?.role.id ?? '';
  const roleRevision = matrix ? `${matrix.role.id}:${matrix.screens.map((s) => `${s.keyPrefix}:${s.level}`).join('|')}` : '';
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const next: Record<string, Level> = {};
    for (const s of matrix?.screens ?? []) next[s.keyPrefix] = s.level;
    setLevels(next);
    setDirty(false);
  }, [roleId, roleRevision, matrix]);

  const grouped = useMemo(() => {
    const map = new Map<string, Matrix['screens']>();
    for (const s of matrix?.screens ?? []) map.set(s.module, [...(map.get(s.module) ?? []), s]);
    return map;
  }, [matrix]);

  const isOwner = matrix?.role.templateKey === 'owner';

  async function selectRole(id: string) {
    if (id === roleId) return;
    if (dirty && !(await askConfirm({ title: 'Leave without saving?', message: 'You have unsaved job changes. Leave this job without saving? Your changes will be lost.', confirmLabel: 'Leave without saving', cancelLabel: 'Keep editing', tone: 'warning' }))) return;
    router.push(`/company/team/jobs?role=${id}`);
  }
  function set(key: string, v: Level) {
    setLevels((prev) => ({ ...prev, [key]: v }));
    setDirty(true);
  }
  function setAll(screens: Matrix['screens'], v: Level) {
    setLevels((prev) => {
      const next = { ...prev };
      for (const s of screens) if (!s.locked) next[s.keyPrefix] = v === 'write' && !s.writeable ? 'read' : v;
      return next;
    });
    setDirty(true);
  }

  return (
    <div className="ux-page jobs-page">
      <header className="ux-head">
        <div className="ux-head-text">
          <div>
            <h1 className="page-title">Jobs</h1>
            <p>A job is what someone is allowed to do. Pick a job to see and change its screens. Give people their job on the People tab.</p>
          </div>
        </div>
      </header>

      <div className="jobs-grid">
        <nav className="jobs-list" aria-label="Jobs">
          {jobs.map((j) => (
            <button
              key={j.id}
              type="button"
              className={matrix?.role.id === j.id ? 'is-current' : ''}
              aria-current={matrix?.role.id === j.id ? 'true' : undefined}
              onClick={() => selectRole(j.id)}
            >
              <span className="jobs-name">
                {j.name}
                {j.customizedAt ? <Badge tone="info">Changed</Badge> : null}
              </span>
              <span className="jobs-desc">{jobDescription(j)}</span>
              <span className="jobs-count">
                {peopleByJob[j.slug] ?? 0} {(peopleByJob[j.slug] ?? 0) === 1 ? 'person' : 'people'}
              </span>
            </button>
          ))}
        </nav>

        {matrix ? (
          <section className="ux-card jobs-matrix" aria-labelledby="jobs-title">
            <header className="ux-card-head">
              <div>
                <h2 id="jobs-title">{matrix.role.name}</h2>
                <p className="ux-muted">
                  {isOwner ? 'The owner always has full access.' : 'No access hides the screen. View lets them look. Edit lets them change things.'}
                </p>
              </div>
              {!isOwner ? (
                <Button variant={dirty ? 'primary' : 'secondary'} type="submit" form="jobs-form" disabled={!dirty}>
                  Save job
                </Button>
              ) : null}
            </header>
            {matrix.sod ? <p className="team-sod jobs-sod">{TEAM_SOD_MESSAGE}</p> : null}
            <form
              key={roleId}
              id="jobs-form"
              className="jobs-form"
              action={async (fd) => {
                const res = await withFormPending(() => saveAction(fd));
                setDirty(false);
                pushStatusToast({ kind: res.ok ? 'success' : 'error', message: res.message ?? (res.ok ? 'Job saved' : 'Could not save the job') });
                router.refresh();
              }}
            >
              <input type="hidden" name="roleId" value={roleId} />
              <div className="jobs-body">
                {[...grouped.entries()].map(([mod, screens]) => (
                  <fieldset key={mod} className="jobs-module">
                    <legend>
                      <span>{MODULE_LABEL[mod] ?? mod}</span>
                      {!isOwner ? (
                        <span className="jobs-setall">
                          Set all:
                          {LEVELS.map((l) => (
                            <button key={l.v} type="button" onClick={() => setAll(screens, l.v)}>
                              {l.label}
                            </button>
                          ))}
                        </span>
                      ) : null}
                    </legend>
                    {screens.map((s) => {
                      const value = levels[s.keyPrefix] ?? s.level;
                      return (
                        <div key={s.keyPrefix} className="jobs-row">
                          <span className="jobs-screen">
                            {s.label}
                            {s.locked ? <Lock size={12} aria-label="Owner or Admin only" /> : null}
                          </span>
                          <div className="jobs-seg" role="radiogroup" aria-label={`${s.label} access for ${matrix.role.name}`}>
                            {LEVELS.filter((l) => l.v !== 'write' || s.writeable).map((l) => (
                              <label key={l.v} className={`is-${l.v}${value === l.v ? ' is-on' : ''}${s.locked ? ' is-locked' : ''}`}>
                                <input
                                  type="radio"
                                  name={`perm_${s.keyPrefix}`}
                                  value={l.v}
                                  checked={value === l.v}
                                  disabled={s.locked}
                                  onChange={() => set(s.keyPrefix, l.v)}
                                />
                                {l.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </fieldset>
                ))}
              </div>
              <div className="jobs-bar">
                <span className={dirty ? 'is-dirty' : ''} role="status">
                  {dirty ? 'You have unsaved job changes.' : 'Saved.'}
                </span>
                <Button variant="primary" type="submit" disabled={!dirty}>
                  Save job
                </Button>
              </div>
            </form>
          </section>
        ) : (
          <div className="ux-empty">
            <h2>Pick a job</h2>
            <p>Choose a job on the left to see what it allows.</p>
          </div>
        )}
      </div>
    </div>
  );
}
