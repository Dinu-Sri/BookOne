'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { assignJob, savePersonOverrides, savePersonScope, setExtraJob, setTeamMemberPassword } from '@/app/actions/team';
import { Button, Card, CardBody, CardHeader } from '@/components/ui/bookone-ui';
import { TEAM_SOD_MESSAGE } from '@/lib/team-sod';

type Job = { id: string; name: string; slug: string; templateKey: string | null };
type Preview = {
  label: string;
  href: string;
  module: string;
  keyPrefix: string;
  writeable: boolean;
  level: 'none' | 'read' | 'write';
  privileged?: boolean;
};
type PersonAccess = {
  person: {
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    status: string;
    jobName: string | null;
    jobSlug: string | null;
    primaryRoleId: string | null;
  };
  extra: { roleId: string; name: string; slug: string } | null;
  exceptionByPrefix: Record<string, 'allow' | 'deny'>;
  preview: Preview[];
  sod: boolean;
  scopeLocationIds: string[];
  scopeBrandIds: string[];
  brands: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  scopeLocked: boolean;
};

export function TeamPersonScreen({ data, jobs }: { data: PersonAccess; jobs: Job[] }) {
  const router = useRouter();
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');
  const extraJobs = jobs.filter((j) => j.templateKey !== 'owner' && j.templateKey !== 'admin' && j.slug !== 'owner' && j.slug !== 'admin');
  const exceptionScreens = data.preview.filter((s) => !s.privileged);
  const visible = data.preview.filter((s) => s.level !== 'none');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p className="muted-line">
        <Link href="/company/team" className="party-back-btn">
          ← Team
        </Link>
      </p>

      <Card>
        <CardHeader title={data.person.name} subtitle={data.person.email} />
        <CardBody>
          {data.sod ? <p className="team-sod">{TEAM_SOD_MESSAGE}</p> : null}
          <form
            className="company-inline-form is-edit"
            action={async (fd) => {
              await assignJob(fd);
              router.refresh();
            }}
          >
            <input type="hidden" name="membershipId" value={data.person.membershipId} />
            <div className="field">
              <label>Job</label>
              <select className="input" name="roleId" defaultValue={data.person.primaryRoleId ?? ''} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                {jobs.map((j) => (
                  <option value={j.id} key={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="party-hint field-full">They will only see the screens for this job, plus any extra job below.</p>
          </form>

          <form
            className="company-inline-form is-edit"
            style={{ marginTop: 12 }}
            action={async (fd) => {
              await setExtraJob(fd);
              router.refresh();
            }}
          >
            <input type="hidden" name="membershipId" value={data.person.membershipId} />
            <div className="field">
              <label>Also help with</label>
              <select className="input" name="roleId" defaultValue={data.extra?.roleId ?? ''} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                <option value="">None</option>
                {extraJobs.map((j) => (
                  <option value={j.id} key={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="party-hint field-full">One extra job only. Owner and Admin cannot be extra jobs.</p>
          </form>

          <form
            className="company-inline-form is-edit"
            style={{ marginTop: 12 }}
            action={async (fd) => {
              setPwdErr('');
              setPwdMsg('');
              const res = await setTeamMemberPassword(fd);
              if (!res.ok) setPwdErr(res.error ?? 'Could not set password.');
              else setPwdMsg(res.message ?? 'Password updated.');
              router.refresh();
            }}
          >
            <input type="hidden" name="userId" value={data.person.userId} />
            <div className="field">
              <label>New password</label>
              <input className="input" name="password" type="password" required minLength={8} placeholder="At least 8 characters" />
            </div>
            <div className="field">
              <label>Confirm password</label>
              <input className="input" name="confirmPassword" type="password" required minLength={8} />
            </div>
            <div className="company-form-footer field-full">
              {pwdErr ? <span className="form-error inline">{pwdErr}</span> : null}
              {pwdMsg ? <span className="entry-result success inline">{pwdMsg}</span> : null}
              <div className="company-form-footer-actions">
                <Button variant="secondary" type="submit">
                  Set password
                </Button>
              </div>
            </div>
            <p className="party-hint field-full">No email is sent. Tell them the new password.</p>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Shops they can use"
          subtitle="Leave blank for every shop. Tick shops to limit this person. POS uses the register location."
        />
        <CardBody>
          {data.scopeLocked ? (
            <p className="muted-line">Owner and Admin always see every shop.</p>
          ) : data.locations.length === 0 && data.brands.length === 0 ? (
            <p className="muted-line">Add brands or locations under Company first.</p>
          ) : (
            <form
              action={async (fd) => {
                await savePersonScope(fd);
                router.refresh();
              }}
            >
              <input type="hidden" name="membershipId" value={data.person.membershipId} />
              {data.locations.length ? (
                <div style={{ marginBottom: 14 }}>
                  <p className="muted-line" style={{ marginBottom: 8 }}>
                    Locations
                  </p>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {data.locations.map((loc) => (
                      <label key={loc.id} className="auth-check" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="checkbox" name="locationId" value={loc.id} defaultChecked={data.scopeLocationIds.includes(loc.id)} />
                        <span>{loc.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              {data.brands.length ? (
                <div style={{ marginBottom: 14 }}>
                  <p className="muted-line" style={{ marginBottom: 8 }}>
                    Brands
                  </p>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {data.brands.map((b) => (
                      <label key={b.id} className="auth-check" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="checkbox" name="brandId" value={b.id} defaultChecked={data.scopeBrandIds.includes(b.id)} />
                        <span>{b.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="company-form-footer">
                <div className="company-form-footer-actions">
                  <Button variant="primary" type="submit">
                    Save shops
                  </Button>
                </div>
              </div>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="What they can open" subtitle="Live preview of this person’s screens." />
        <CardBody>
          {visible.length === 0 ? (
            <p className="muted-line">No screens. Check their job.</p>
          ) : (
            <ul className="muted-line" style={{ display: 'grid', gap: 6 }}>
              {visible.map((s) => (
                <li key={s.keyPrefix}>
                  {s.label}
                  {s.level === 'read' ? ' · View only' : ''}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Exceptions" subtitle="Rare. Inherit from the job, or Allow / Block one screen. Deny wins." />
        <CardBody>
          <form
            action={async (fd) => {
              await savePersonOverrides(fd);
              router.refresh();
            }}
          >
            <input type="hidden" name="userId" value={data.person.userId} />
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Screen</th>
                    <th>From job</th>
                    <th>Exception</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptionScreens.map((s) => (
                    <tr key={s.keyPrefix}>
                      <td>{s.label}</td>
                      <td>{s.level === 'write' ? 'Can edit' : s.level === 'read' ? 'View only' : 'No access'}</td>
                      <td>
                        <select className="input" name={`ex_${s.keyPrefix}`} defaultValue={data.exceptionByPrefix[s.keyPrefix] ?? 'inherit'}>
                          <option value="inherit">Inherit</option>
                          <option value="allow">Allow</option>
                          <option value="deny">Block</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="company-form-footer">
              <div className="company-form-footer-actions">
                <Button variant="primary" type="submit">
                  Save exceptions
                </Button>
              </div>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
