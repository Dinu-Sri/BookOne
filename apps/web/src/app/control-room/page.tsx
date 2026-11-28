import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPlatformOverview } from '@/app/actions/platform';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge } from '@/components/ui/bookone-ui';
import { companyStatusWord, planWord, platformEventWord, shortDateTime } from '@/lib/platform-labels';
import { entityKindLabel } from '@/lib/entity-labels';
import { isPlatformAdmin } from '@/lib/platform-admin';

export default async function ControlRoomOverviewPage() {
  let tenant;
  let data;
  try {
    tenant = await getTenantInfo();
    data = await getPlatformOverview();
  } catch {
    redirect('/login');
  }

  if (!isPlatformAdmin(tenant)) {
    redirect('/');
  }

  return (
    <BookOneShell active="Overview" tenant={tenant}>
      <div className="workspace ux-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Control Room</h1>
              <p>Every company on this BookOne server. Open one to change its details, plan or status.</p>
            </div>
          </div>
          <div className="ux-head-actions">
            <Link href="/control-room/companies/new" className="button primary">
              New company
            </Link>
          </div>
        </header>

        <div className="ux-split">
          <div className="ux-main set-stack">
            <section className="ux-card" aria-labelledby="cr-recent-title">
              <header className="ux-card-head">
                <h2 id="cr-recent-title">Recent companies</h2>
                <Link href="/control-room/companies" className="cr-link">
                  All companies
                </Link>
              </header>
              {data.recent.length === 0 ? (
                <div className="ux-empty cr-empty">
                  <h2>No companies yet</h2>
                  <p>Use New company to set up the first one.</p>
                </div>
              ) : (
                <div className="ux-rows">
                  {data.recent.map((row) => {
                    const st = companyStatusWord(row.status);
                    return (
                      <Link className="ux-row cr-row" key={row.id} href={`/control-room/companies/${row.id}`}>
                        <span className="ux-row-text">
                          <strong>{row.name}</strong>
                          <span>
                            {entityKindLabel(row.entityKind, row.capabilityTier)} · {planWord(row.plan)} plan
                          </span>
                        </span>
                        <span className="ux-row-side">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          <span className="cr-open">Open</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="ux-card" aria-labelledby="cr-activity-title">
              <header className="ux-card-head">
                <h2 id="cr-activity-title">Recent changes</h2>
                <span>Made in Control Room</span>
              </header>
              {data.recentAudit.length === 0 ? (
                <div className="ux-empty cr-empty">
                  <p>No changes yet.</p>
                </div>
              ) : (
                <div className="ux-rows">
                  {data.recentAudit.map((row) => (
                    <div className="ux-row" key={row.id}>
                      <span className="ux-row-text">
                        <strong>{platformEventWord(row.action)}</strong>
                        <span>{row.targetName ?? row.summary ?? '—'}</span>
                      </span>
                      <span className="cr-when">{shortDateTime(row.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="ux-guide cr-summary" aria-label="Companies summary">
            <h2>Companies</h2>
            <dl className="ux-statement">
              <div>
                <dt>Active </dt>
                <dd>{data.counts.active}</dd>
              </div>
              <div>
                <dt>Suspended </dt>
                <dd>{data.counts.suspended}</dd>
              </div>
              <div className="is-total">
                <dt>All companies </dt>
                <dd>{data.counts.total}</dd>
              </div>
            </dl>
            <p className="cr-env">
              This server is <strong>{data.appEnv === 'staging' ? 'a test server (staging)' : 'live (production)'}</strong>.{' '}
              {data.counts.staging} test and {data.counts.production} live companies.
            </p>
            <div className="ux-guide-links">
              <Link href="/control-room/modules">Modules</Link>
              <Link href="/control-room/access">Access</Link>
              <Link href="/control-room/health-check">Health check</Link>
            </div>
          </aside>
        </div>
      </div>
    </BookOneShell>
  );
}
