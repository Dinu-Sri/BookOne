import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPlatformOverview } from '@/app/actions/platform';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

export default async function ControlRoomOverviewPage() {
  let tenant;
  let data;
  try {
    tenant = await getTenantInfo();
    data = await getPlatformOverview();
  } catch {
    redirect('/login');
  }

  if (tenant.userRole !== 'super_admin' && tenant.userEmail !== 'dinu.sri.m@gmail.com') {
    redirect('/');
  }

  const metrics = [
    { label: 'Companies', value: String(data.counts.total), note: 'All tenants' },
    { label: 'Active', value: String(data.counts.active), note: 'Can operate' },
    { label: 'Suspended', value: String(data.counts.suspended), note: 'Blocked' },
    {
      label: 'App env',
      value: data.appEnv === 'staging' ? 'Staging' : 'Production',
      note: `${data.counts.staging} staging · ${data.counts.production} prod tenants`,
    },
  ];

  return (
    <BookOneShell active="Overview" tenant={tenant}>
      <div className="workspace party-workspace" style={{ display: 'grid', gap: 14 }}>
        <div className="party-toolbar">
          <div className="cluster" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Link href="/control-room/companies">
              <Button variant="secondary" type="button">
                Companies
              </Button>
            </Link>
            <Link href="/control-room/modules">
              <Button variant="secondary" type="button">
                Modules
              </Button>
            </Link>
            <Link href="/control-room/health-check">
              <Button variant="secondary" type="button">
                Health check
              </Button>
            </Link>
          </div>
          <Link href="/control-room/companies/new" style={{ marginLeft: 'auto' }}>
            <Button variant="primary" type="button">
              New company
            </Button>
          </Link>
        </div>

        <div className="grid metrics">
          {metrics.map((m) => (
            <Card key={m.label} className="metric-card">
              <p className="metric-label">{m.label}</p>
              <p className="metric-value" style={{ fontSize: 22 }}>
                {m.value}
              </p>
              <p className="metric-note">{m.note}</p>
            </Card>
          ))}
        </div>

        <div className="grid two" style={{ alignItems: 'start' }}>
          <Card>
            <div className="card-header" style={{ paddingBottom: 0 }}>
              <div>
                <h2 className="card-title">Recent companies</h2>
              </div>
              <Link href="/control-room/companies">
                <Button variant="ghost" type="button">
                  View all
                </Button>
              </Link>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Plan</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ color: 'var(--ink-muted)' }}>
                          No companies yet
                        </td>
                      </tr>
                    ) : (
                      data.recent.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <div style={{ fontWeight: 700 }}>{row.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{row.slug}</div>
                          </td>
                          <td style={{ textTransform: 'capitalize' }}>{row.plan}</td>
                          <td>
                            <StatusBadge status={row.status === 'active' ? 'active' : 'inactive'} />
                          </td>
                          <td>
                            <Link href={`/control-room/companies/${row.id}`}>
                              <Button variant="ghost" type="button">
                                Open
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          <Card>
            <div className="card-header" style={{ paddingBottom: 0 }}>
              <div>
                <h2 className="card-title">Recent platform activity</h2>
              </div>
              <Link href="/control-room/audit">
                <Button variant="ghost" type="button">
                  Audit
                </Button>
              </Link>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Action</th>
                      <th>Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentAudit.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ color: 'var(--ink-muted)' }}>
                          No audit events yet
                        </td>
                      </tr>
                    ) : (
                      data.recentAudit.map((row) => (
                        <tr key={row.id}>
                          <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                            {new Date(row.createdAt).toLocaleString()}
                          </td>
                          <td>
                            <div style={{ fontWeight: 650 }}>{row.action}</div>
                            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                              {row.summary ?? '—'}
                            </div>
                          </td>
                          <td style={{ fontSize: 13 }}>{row.targetName ?? '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </BookOneShell>
  );
}
