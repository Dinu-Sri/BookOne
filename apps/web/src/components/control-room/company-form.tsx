'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import {
  applyPlanModulesFromForm,
  createPlatformCompanyFromForm,
  setPlatformCompanyStatusFromForm,
  updatePlatformCompanyFromForm,
  type PlatformCompanyDetail,
} from '@/app/actions/platform';
import { pushStatusToast } from '@/components/layout/status-toast';
import { MODULE_CATALOG, MODULE_KEYS, modulesForPlan, type ModuleKey } from '@/lib/platform-modules';
import { StatusBadge } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const CREATE_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'modules', label: 'Plan & modules' },
  { id: 'owner', label: 'Owner' },
] as const;

const EDIT_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'modules', label: 'Plan & modules' },
  { id: 'users', label: 'Users' },
  { id: 'status', label: 'Status' },
] as const;

type CreateTab = (typeof CREATE_TABS)[number]['id'];
type EditTab = (typeof EDIT_TABS)[number]['id'];

function ModuleChecks({
  modules,
  onChange,
}: {
  modules: Record<ModuleKey, boolean>;
  onChange: (key: ModuleKey, value: boolean) => void;
}) {
  return (
    <div className="party-tab-grid">
      {MODULE_CATALOG.map((m) => {
        if (m.alwaysOn) {
          return (
            <div className="field" key={m.key}>
              <label>{m.name}</label>
              <div className="input" style={{ display: 'flex', alignItems: 'center', color: 'var(--ink-muted)' }}>
                Always on
              </div>
              <small style={{ color: 'var(--ink-soft)' }}>{m.summary}</small>
            </div>
          );
        }
        const key = m.key as ModuleKey;
        return (
          <div className="field" key={m.key}>
            <label htmlFor={`module_${key}`}>{m.name}</label>
            <label
              className="input"
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            >
              <input
                id={`module_${key}`}
                name={`module_${key}`}
                type="checkbox"
                checked={modules[key]}
                onChange={(e) => onChange(key, e.target.checked)}
              />
              <span>{modules[key] ? 'Enabled' : 'Disabled'}</span>
            </label>
            <small style={{ color: 'var(--ink-soft)' }}>{m.summary}</small>
          </div>
        );
      })}
    </div>
  );
}

export function CompanyCreateForm() {
  const [tab, setTab] = useState<CreateTab>('profile');
  const [plan, setPlan] = useState('starter');
  const [modules, setModules] = useState(() => modulesForPlan('starter'));
  const [pending, startTransition] = useTransition();

  function onPlanChange(next: string) {
    setPlan(next);
    setModules(modulesForPlan(next));
  }

  return (
    <div className="party-form-shell">
      <div className="party-form-top">
        <Link href="/control-room/companies" className="party-back-btn">
          <span className="party-back-arrow" aria-hidden>
            ←
          </span>
          <span>
            <strong>Back to list</strong>
            <small>Companies</small>
          </span>
        </Link>
        <div className="party-tabs" role="tablist">
          {CREATE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={`party-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <form
        className="party-form-body"
        action={(fd) => {
          startTransition(async () => {
            try {
              fd.set('module_touch', '1');
              for (const key of MODULE_KEYS) {
                if (modules[key]) fd.set(`module_${key}`, 'on');
                else fd.delete(`module_${key}`);
              }
              await createPlatformCompanyFromForm(fd);
            } catch (e) {
              // redirect() throws; let Next.js handle navigation
              if (
                e &&
                typeof e === 'object' &&
                'digest' in e &&
                String((e as { digest?: string }).digest).startsWith('NEXT_REDIRECT')
              ) {
                throw e;
              }
              pushStatusToast({
                kind: 'error',
                message: e instanceof Error ? e.message : 'Could not create company',
              });
            }
          });
        }}
      >
        <div className="party-tab-panel" hidden={tab !== 'profile'}>
          <div className="party-tab-grid">
            <div className="field field-full">
              <label htmlFor="name">Company name</label>
              <input className="input" id="name" name="name" required autoComplete="organization" />
            </div>
            <div className="field">
              <label htmlFor="slug">Slug (optional)</label>
              <input className="input" id="slug" name="slug" placeholder="auto from name" />
            </div>
            <div className="field">
              <label htmlFor="environment">Environment</label>
              <select className="input" id="environment" name="environment" defaultValue="production">
                <option value="production">Production</option>
                <option value="staging">Staging</option>
              </select>
            </div>
          </div>
        </div>

        <div className="party-tab-panel" hidden={tab !== 'modules'}>
          <div className="party-tab-grid" style={{ marginBottom: 12 }}>
            <div className="field">
              <label htmlFor="plan">Plan</label>
              <select
                className="input"
                id="plan"
                name="plan"
                value={plan}
                onChange={(e) => onPlanChange(e.target.value)}
              >
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="pro">Pro</option>
              </select>
            </div>
          </div>
          <input type="hidden" name="module_touch" value="1" />
          <ModuleChecks
            modules={modules}
            onChange={(key, value) => setModules((m) => ({ ...m, [key]: value }))}
          />
        </div>

        <div className="party-tab-panel" hidden={tab !== 'owner'}>
          <div className="party-tab-grid">
            <div className="field">
              <label htmlFor="ownerName">Owner name</label>
              <input className="input" id="ownerName" name="ownerName" autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="ownerEmail">Owner email</label>
              <input
                className="input"
                id="ownerEmail"
                name="ownerEmail"
                type="email"
                required
                autoComplete="email"
              />
            </div>
            <div className="field field-full">
              <label>Sign-in</label>
              <div className="input" style={{ color: 'var(--ink-muted)', minHeight: 40 }}>
                Owner signs in at /login with this email (Better Auth).
              </div>
            </div>
          </div>
        </div>

        <div className="party-form-footer">
          <Button variant="secondary" type="button" onClick={() => setTab('profile')}>
            Profile
          </Button>
          <div className="cluster" style={{ marginLeft: 'auto', gap: 8 }}>
            {tab !== 'owner' ? (
              <Button
                variant="primary"
                type="button"
                onClick={() => setTab(tab === 'profile' ? 'modules' : 'owner')}
              >
                Next
              </Button>
            ) : (
              <Button variant="primary" type="submit" disabled={pending}>
                {pending ? 'Creating…' : 'Create company'}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

export function CompanyEditForm({ company }: { company: PlatformCompanyDetail }) {
  const [tab, setTab] = useState<EditTab>('profile');
  const [plan, setPlan] = useState(company.plan);
  const [modules, setModules] = useState(company.modules);
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<null | 'suspend' | 'restore'>(null);

  const statusLabel = useMemo(
    () => (company.status === 'suspended' ? 'suspended' : 'active'),
    [company.status],
  );

  function onPlanChange(next: string) {
    setPlan(next);
    setModules(modulesForPlan(next));
  }

  function runStatus() {
    if (!confirm) return;
    const fd = new FormData();
    fd.set('id', company.id);
    fd.set('status', confirm === 'suspend' ? 'suspended' : 'active');
    startTransition(async () => {
      try {
        await setPlatformCompanyStatusFromForm(fd);
        pushStatusToast({
          kind: 'success',
          message: confirm === 'suspend' ? 'Company suspended' : 'Company restored',
        });
        setConfirm(null);
      } catch (e) {
        pushStatusToast({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Status update failed',
        });
      }
    });
  }

  return (
    <div className="party-form-shell">
      <div className="party-form-top">
        <Link href="/control-room/companies" className="party-back-btn">
          <span className="party-back-arrow" aria-hidden>
            ←
          </span>
          <span>
            <strong>Back to list</strong>
            <small>{company.slug}</small>
          </span>
        </Link>
        <div className="party-tabs" role="tablist">
          {EDIT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={`party-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="cluster" style={{ marginLeft: 8, gap: 8 }}>
          <StatusBadge status={statusLabel === 'active' ? 'active' : 'inactive'} />
          <span style={{ fontSize: 12, color: 'var(--ink-muted)', textTransform: 'capitalize' }}>
            {company.environment}
          </span>
        </div>
      </div>

      <form
        className="party-form-body"
        action={(fd) => {
          startTransition(async () => {
            try {
              fd.set('id', company.id);
              fd.set('module_touch', '1');
              for (const key of MODULE_KEYS) {
                if (modules[key]) fd.set(`module_${key}`, 'on');
                else fd.delete(`module_${key}`);
              }
              await updatePlatformCompanyFromForm(fd);
              pushStatusToast({ kind: 'success', message: 'Company saved' });
            } catch (e) {
              pushStatusToast({
                kind: 'error',
                message: e instanceof Error ? e.message : 'Save failed',
              });
            }
          });
        }}
      >
        <input type="hidden" name="id" value={company.id} />
        <input type="hidden" name="module_touch" value="1" />

        <div className="party-tab-panel" hidden={tab !== 'profile'}>
          <div className="party-tab-grid">
            <div className="field field-full">
              <label htmlFor="name">Company name</label>
              <input className="input" id="name" name="name" required defaultValue={company.name} />
            </div>
            <div className="field">
              <label>Slug</label>
              <div className="input" style={{ color: 'var(--ink-muted)' }}>
                {company.slug}
              </div>
            </div>
            <div className="field">
              <label htmlFor="environment">Environment</label>
              <select
                className="input"
                id="environment"
                name="environment"
                defaultValue={company.environment}
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
              </select>
            </div>
            <div className="field">
              <label>Currency / TZ</label>
              <div className="input" style={{ color: 'var(--ink-muted)' }}>
                {company.profile?.baseCurrency ?? 'LKR'} · {company.profile?.timezone ?? 'Asia/Colombo'}
              </div>
            </div>
          </div>
        </div>

        <div className="party-tab-panel" hidden={tab !== 'modules'}>
          <div className="party-tab-grid" style={{ marginBottom: 12 }}>
            <div className="field">
              <label htmlFor="plan">Plan</label>
              <select
                className="input"
                id="plan"
                name="plan"
                value={plan}
                onChange={(e) => onPlanChange(e.target.value)}
              >
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  const fd = new FormData();
                  fd.set('id', company.id);
                  startTransition(async () => {
                    try {
                      await applyPlanModulesFromForm(fd);
                      setModules(modulesForPlan(plan));
                      pushStatusToast({ kind: 'success', message: 'Modules reset to plan defaults' });
                    } catch (e) {
                      pushStatusToast({
                        kind: 'error',
                        message: e instanceof Error ? e.message : 'Reset failed',
                      });
                    }
                  });
                }}
              >
                Reset to plan defaults
              </Button>
            </div>
          </div>
          <ModuleChecks
            modules={modules}
            onChange={(key, value) => setModules((m) => ({ ...m, [key]: value }))}
          />
        </div>

        <div className="party-tab-panel" hidden={tab !== 'users'}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {company.members.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--ink-muted)' }}>
                      No members yet
                    </td>
                  </tr>
                ) : (
                  company.members.map((m) => (
                    <tr key={m.membershipId}>
                      <td style={{ fontWeight: 650 }}>{m.name}</td>
                      <td>{m.email}</td>
                      <td style={{ textTransform: 'capitalize' }}>{m.role}</td>
                      <td>
                        <StatusBadge status={m.status === 'active' ? 'active' : 'inactive'} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="party-tab-panel" hidden={tab !== 'status'}>
          <div className="party-tab-grid">
            <div className="field">
              <label>Current status</label>
              <div className="cluster" style={{ gap: 10 }}>
                <StatusBadge status={statusLabel === 'active' ? 'active' : 'inactive'} />
                <span style={{ textTransform: 'capitalize' }}>{statusLabel}</span>
              </div>
            </div>
            <div className="field field-full">
              <label>Actions</label>
              <div className="cluster" style={{ gap: 10 }}>
                {company.status === 'suspended' ? (
                  <Button variant="primary" type="button" onClick={() => setConfirm('restore')}>
                    Restore company
                  </Button>
                ) : (
                  <Button variant="secondary" type="button" onClick={() => setConfirm('suspend')}>
                    Suspend company
                  </Button>
                )}
              </div>
              <small style={{ color: 'var(--ink-soft)', display: 'block', marginTop: 8 }}>
                Suspended companies should not use the product; block at login in a follow-up if needed.
              </small>
            </div>
            {company.environment === 'staging' ? (
              <div className="field field-full">
                <label>Staging tools</label>
                <Link href="/control-room/health-check">
                  <Button variant="secondary" type="button">
                    Open ERP Health Check
                  </Button>
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        {tab !== 'users' && tab !== 'status' ? (
          <div className="party-form-footer">
            <span style={{ color: 'var(--ink-muted)', fontSize: 13 }}>{company.name}</span>
            <Button variant="primary" type="submit" disabled={pending} style={{ marginLeft: 'auto' }}>
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        ) : null}
      </form>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'suspend' ? 'Suspend company?' : 'Restore company?'}
        message={
          confirm === 'suspend'
            ? `Suspend ${company.name}? They should not continue operating until restored.`
            : `Restore ${company.name} to active?`
        }
        confirmLabel={confirm === 'suspend' ? 'Suspend' : 'Restore'}
        tone={confirm === 'suspend' ? 'danger' : 'primary'}
        busy={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={runStatus}
      />
    </div>
  );
}
