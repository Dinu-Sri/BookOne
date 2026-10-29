import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantInfo } from '@/app/actions/workspace';
import { listFinancialAuditEvents } from '@/app/actions/financial-audit';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button, Card } from '@/components/ui/bookone-ui';
import { ClipboardCheck } from 'lucide-react';

export default async function FinancialAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ record?: string; table?: string }>;
}) {
  const params = await searchParams;
  let tenant;
  let events;
  try {
    [tenant, events] = await Promise.all([
      getTenantInfo(),
      listFinancialAuditEvents({
        recordId: params.record,
        tableName: params.table,
      }),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Activity" tenant={tenant}>
      <div className="workspace">
        <div className="party-form-top">
          <Link href="/journal" className="party-back-btn">
            <span className="party-back-arrow" aria-hidden>
              ←
            </span>
            <span>
              <strong>Back</strong>
              <small>Journal</small>
            </span>
          </Link>
        </div>

        <Card>
          <div className="card-header">
            <div>
              <p className="eyebrow">Tenant financial audit</p>
              <h2 className="card-title" style={{ marginTop: 4 }}>
                Activity
              </h2>
              <p className="muted-line" style={{ marginTop: 6 }}>
                Actor, action, source and event for this company. Journals stay on the Journal page.
                Team access history stays on Team.
              </p>
            </div>
            <Badge tone="info">
              <ClipboardCheck size={12} /> {events.length} recent
            </Badge>
          </div>
          <div className="card-body">
            {events.length === 0 ? (
              <div className="empty-state">
                <h3>No financial audit events in this company</h3>
                <p>Posted documents, payments and stock writes appear here after they are saved.</p>
                <Link href="/journal">
                  <Button variant="secondary" style={{ marginTop: 14 }}>
                    Open journal
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Source</th>
                      <th>Event</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((row) => (
                      <tr key={row.id}>
                        <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</td>
                        <td>
                          <strong>{row.actorName || row.actorEmail || '—'}</strong>
                          {row.actorEmail && row.actorName ? (
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{row.actorEmail}</div>
                          ) : null}
                        </td>
                        <td>
                          <Badge tone="info">{row.action}</Badge>
                        </td>
                        <td>
                          {row.sourceLabel}
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{row.recordId}</div>
                        </td>
                        <td>{row.event}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>
    </BookOneShell>
  );
}
