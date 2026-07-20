import { redirect } from 'next/navigation';
import { listPlatformAudit } from '@/app/actions/platform';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Card } from '@/components/ui/bookone-ui';

export default async function AuditPage() {
  let tenant;
  let rows;
  try {
    tenant = await getTenantInfo();
    if (tenant.userRole !== 'super_admin' && tenant.userEmail !== 'dinu.sri.m@gmail.com') {
      redirect('/');
    }
    rows = await listPlatformAudit(80);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Audit" tenant={tenant}>
      <div className="workspace party-workspace">
        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ color: 'var(--ink-muted)' }}>
                        No platform audit events yet
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                        <td style={{ fontSize: 13 }}>{row.actorEmail ?? '—'}</td>
                        <td style={{ fontWeight: 650 }}>{row.action}</td>
                        <td style={{ fontSize: 13 }}>{row.targetName ?? '—'}</td>
                        <td style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
                          {row.summary ?? '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>
    </BookOneShell>
  );
}
