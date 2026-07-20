import { redirect } from 'next/navigation';
import { getDashboardData } from '@/app/actions/workspace';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Card, MetricCard } from '@/components/ui/bookone-ui';

interface SearchParams { period?: string }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  let data;
  let tenant;
  try {
    [data, tenant] = await Promise.all([getDashboardData(params?.period), getTenantInfo()]);
  } catch (err) {
    redirect('/login');
  }

  const period = { selected: data.selectedPeriod, available: data.availablePeriods };

  return (
    <BookOneShell active="Dashboard" tenant={tenant} period={period}>
      <div className="workspace">
        <div className="grid metrics">
          {data.metrics.map((m) => (
            <MetricCard key={m.label} label={m.label} value={m.value} note={m.note} tone={m.tone} />
          ))}
        </div>

        <div className="grid two" style={{ marginTop: 18 }}>
          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">Cash flow</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Money movement</h2>
              </div>
              <Badge tone={data.cashFlow.net >= 0 ? 'success' : 'danger'}>
                {data.cashFlow.net >= 0 ? 'Positive' : 'Negative'}
              </Badge>
            </div>
            <div className="card-body">
              <div className="cashflow-bars">
                <div>
                  <span>Money in</span>
                  <strong>LKR {data.cashFlow.moneyIn.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                  <div className="cashflow-track"><i style={{ width: data.cashFlow.moneyIn > 0 ? '100%' : '0%' }} /></div>
                </div>
                <div>
                  <span>Money out</span>
                  <strong>LKR {data.cashFlow.moneyOut.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                  <div className="cashflow-track out"><i style={{ width: data.cashFlow.moneyOut > 0 ? '100%' : '0%' }} /></div>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">Period activity</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Posting health</h2>
              </div>
              <Badge tone={data.lowConfidenceCount > 0 ? 'warning' : 'success'}>
                {data.lowConfidenceCount > 0 ? 'Review' : 'Clean'}
              </Badge>
            </div>
            <div className="card-body">
              <div className="balance-list">
                <div className="balance-row">
                  <div>
                    <strong>{data.cashFlow.transactionCount} posted entries</strong>
                    <span>Included in the selected period.</span>
                  </div>
                  <Badge tone="info">Live</Badge>
                </div>
                <div className="balance-row">
                  <div>
                    <strong>{data.lowConfidenceCount} category reviews</strong>
                    <span>Entries below 70% confidence.</span>
                  </div>
                  <Badge tone={data.lowConfidenceCount > 0 ? 'warning' : 'success'}>
                    {data.lowConfidenceCount > 0 ? 'Pending' : 'OK'}
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </BookOneShell>
  );
}
