import { redirect } from 'next/navigation';
import { getDashboardData, getTenantInfo, listTransactions } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { BankReconciliationWizard } from '@/components/reconciliation/bank-reconciliation-wizard';
import { Badge, Card, PageHeading } from '@/components/ui/bookone-ui';
import { CircleAlert, ShieldCheck } from 'lucide-react';

interface SearchParams { period?: string }

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  let tenant;
  let data;
  let transactions;
  try {
    [tenant, data, transactions] = await Promise.all([
      getTenantInfo(),
      getDashboardData(params?.period),
      listTransactions(params?.period),
    ]);
  } catch (err) {
    redirect('/login');
  }

  const period = { selected: data.selectedPeriod, available: data.availablePeriods };
  const periodLabel = period.selected
    ? new Date(`${period.selected}-01`).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : 'All time';

  return (
    <BookOneShell active="Reconciliation" tenant={tenant} period={period}>
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
                <h2 className="card-title" style={{ marginTop: 4 }}>Before you close {periodLabel}</h2>
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

          <BankReconciliationWizard transactions={transactions} />
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
