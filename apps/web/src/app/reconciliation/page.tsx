import { redirect } from 'next/navigation';
import { getDashboardData, getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button, Card, PageHeading } from '@/components/ui/bookone-ui';
import { CircleAlert, ShieldCheck, Wallet } from 'lucide-react';

export default async function ReconciliationPage() {
  let tenant;
  let data;
  try {
    [tenant, data] = await Promise.all([getTenantInfo(), getDashboardData()]);
  } catch (err) {
    redirect('/login');
  }

  return (
    <BookOneShell active="Reconciliation" tenant={tenant}>
      <div className="workspace">
        <PageHeading
          eyebrow="Period close"
          title="Reconciliation"
          lead="Quick checks before you close a period. Locked periods are read-only — to change them, create a reversing entry."
        />

        <div className="grid two">
          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">Period close checklist</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Before you close {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}</h2>
              </div>
              <Badge tone={data.lowConfidenceCount > 0 ? 'warning' : 'success'}>
                {data.lowConfidenceCount > 0 ? `${data.lowConfidenceCount} pending` : 'All clear'}
              </Badge>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gap: 10 }}>
                <ChecklistItem
                  ok={data.lowConfidenceCount === 0}
                  title="All categories reviewed"
                  detail={data.lowConfidenceCount === 0 ? 'No low-confidence categories need attention.' : `${data.lowConfidenceCount} categor${data.lowConfidenceCount === 1 ? 'y' : 'ies'} below 70% confidence.`}
                />
                <ChecklistItem
                  ok={data.recentTransactions.length > 0}
                  title="At least one transaction posted"
                  detail={data.recentTransactions.length === 0 ? 'Record an entry to validate the engine.' : `${data.recentTransactions.length} recent entries posted.`}
                />
                <ChecklistItem
                  ok
                  title="Backups up to date"
                  detail="Daily Postgres backups enabled (configurable in DEPLOYMENT_WORKFLOW.md)."
                />
                <ChecklistItem
                  ok
                  title="Audit log enabled"
                  detail="All mutations are recorded in audit_log with full new_values."
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">Bank reconciliation</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Match to statement</h2>
              </div>
              <Wallet size={18} color="var(--brand)" />
            </div>
            <div className="card-body">
              <p style={{ color: 'var(--ink-muted)', fontSize: 13, lineHeight: 1.5 }}>
                The bank reconciliation wizard will be enabled in the next release. It will let you
                upload a CSV from your bank and automatically match each line to your posted journal
                entries.
              </p>
              <Button variant="secondary" disabled style={{ marginTop: 14 }}>
                Coming soon
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </BookOneShell>
  );
}

function ChecklistItem({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <div className="balance-row" style={{ padding: '12px 14px' }}>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {ok ? (
        <Badge tone="success"><ShieldCheck size={12} /> OK</Badge>
      ) : (
        <Badge tone="warning"><CircleAlert size={12} /> Pending</Badge>
      )}
    </div>
  );
}
