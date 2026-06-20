import { redirect } from 'next/navigation';
import { getPeriodOptions, getReports, getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Card, PageHeading, SelectLike } from '@/components/ui/bookone-ui';
import { LineChart } from 'lucide-react';

function formatLKR(value: number) {
  const sign = value < 0 ? '-' : '';
  return `${sign}LKR ${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

interface SearchParams { period?: string }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  let tenant;
  let data;
  let periodOptions;
  try {
    [tenant, data, periodOptions] = await Promise.all([
      getTenantInfo(),
      getReports(params?.period),
      getPeriodOptions(params?.period),
    ]);
  } catch {
    redirect('/login');
  }

  const periodLabel = periodOptions.selected
    ? new Date(`${periodOptions.selected}-01`).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : 'All time';

  return (
    <BookOneShell active="Reports" tenant={tenant} period={periodOptions}>
      <div className="workspace">
        <PageHeading
          eyebrow="Insights"
          title="Reports"
          lead="Profit & Loss, Balance Sheet, Cash Flow, General Ledger, and Trial Balance from posted journals."
        />

        <div className="grid metrics">
          <Card className="metric-card">
            <p className="metric-label">Net income</p>
            <p className="metric-value">{formatLKR(data.income.netIncome)}</p>
            <p className="metric-note">{periodLabel}</p>
          </Card>
          <Card className="metric-card">
            <p className="metric-label">Net cash flow</p>
            <p className="metric-value">{formatLKR(data.cashFlow.netCashFlow)}</p>
            <p className="metric-note">{data.cashFlow.transactionCount} posted entries</p>
          </Card>
          <Card className="metric-card">
            <p className="metric-label">Assets</p>
            <p className="metric-value">{formatLKR(data.balanceSheet.totalAssets)}</p>
            <p className="metric-note">Asset accounts in view</p>
          </Card>
          <Card className="metric-card">
            <p className="metric-label">Liabilities</p>
            <p className="metric-value">{formatLKR(data.balanceSheet.totalLiabilities)}</p>
            <p className="metric-note">Payables and debts</p>
          </Card>
        </div>

        <div className="grid two" style={{ marginTop: 16 }}>
          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">Profit & Loss</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Income statement</h2>
                <p className="card-subtitle">{periodLabel}</p>
              </div>
              <Badge tone={data.income.netIncome >= 0 ? 'success' : 'danger'}>
                {data.income.netIncome >= 0 ? 'Profit' : 'Loss'} - {formatLKR(data.income.netIncome)}
              </Badge>
            </div>
            <div className="card-body">
              <StatementGroup title="Revenue" rows={data.income.revenue} tone="positive" />
              <StatementGroup title="Expenses" rows={data.income.expense} tone="negative" />
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">Balance Sheet</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Position summary</h2>
                <p className="card-subtitle">{periodLabel}</p>
              </div>
              <SelectLike>
                <span className="cluster"><LineChart size={16} /> Statement</span>
              </SelectLike>
            </div>
            <div className="card-body">
              <StatementGroup title="Assets" rows={data.balanceSheet.assets} tone="positive" />
              <StatementGroup title="Liabilities" rows={data.balanceSheet.liabilities} tone="negative" />
              <StatementGroup title="Equity" rows={data.balanceSheet.equity} tone="positive" />
            </div>
          </Card>
        </div>

        <div className="grid two" style={{ marginTop: 16 }}>
          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">Cash Flow</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Money movement</h2>
              </div>
            </div>
            <div className="card-body">
              <div className="balance-list">
                <div className="balance-row">
                  <div><strong>Money in</strong><span>Cash receipts in view</span></div>
                  <div className="amount-positive">{formatLKR(data.cashFlow.moneyIn)}</div>
                </div>
                <div className="balance-row">
                  <div><strong>Money out</strong><span>Cash payments in view</span></div>
                  <div className="amount-negative">{formatLKR(data.cashFlow.moneyOut)}</div>
                </div>
                <div className="balance-row">
                  <div><strong>Net cash flow</strong><span>Money in less money out</span></div>
                  <div className={data.cashFlow.netCashFlow >= 0 ? 'amount-positive' : 'amount-negative'}>
                    {formatLKR(data.cashFlow.netCashFlow)}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">General Ledger</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Recent journal detail</h2>
              </div>
            </div>
            <div className="card-body">
              <div className="timeline">
                {data.generalLedger.slice(0, 8).map((entry) => (
                  <div className="journal-line" key={entry.id}>
                    <div>
                      <strong>{entry.entryDate} - {entry.party}</strong>
                      <span>{entry.memo}</span>
                    </div>
                    <Badge tone="info">{entry.lines.length} lines</Badge>
                  </div>
                ))}
                {data.generalLedger.length === 0 ? (
                  <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No journal entries yet.</p>
                ) : null}
              </div>
            </div>
          </Card>
        </div>

        <Card style={{ marginTop: 16 }}>
          <div className="card-header">
            <div>
              <p className="eyebrow">Accounting</p>
              <h2 className="card-title" style={{ marginTop: 4 }}>Trial balance</h2>
            </div>
          </div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Debit</th>
                    <th style={{ textAlign: 'right' }}>Credit</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trialBalance.length === 0 ? (
                    <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>No data yet.</td></tr>
                  ) : data.trialBalance.map((row) => (
                    <tr key={row.accountCode}>
                      <td>{row.accountCode} - {row.accountName}</td>
                      <td>{row.type}</td>
                      <td style={{ textAlign: 'right' }}>{row.debit ? formatLKR(row.debit) : '-'}</td>
                      <td style={{ textAlign: 'right' }}>{row.credit ? formatLKR(row.credit) : '-'}</td>
                      <td style={{ textAlign: 'right' }} className={row.balance < 0 ? 'amount-negative' : 'amount-positive'}>
                        {formatLKR(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>
    </BookOneShell>
  );
}

function StatementGroup({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: { accountCode: string; accountName: string; balance: number }[];
  tone: 'positive' | 'negative';
}) {
  return (
    <>
      <p style={{ fontSize: 12, fontWeight: 850, color: 'var(--ink-muted)', marginBottom: 8, marginTop: title === 'Revenue' || title === 'Assets' ? 0 : 16 }}>
        {title.toUpperCase()}
      </p>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No {title.toLowerCase()} recorded.</p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {rows.map((row) => (
            <div key={row.accountCode} className="balance-row" style={{ padding: '8px 12px' }}>
              <div>
                <strong>{row.accountName}</strong>
                <span>{row.accountCode}</span>
              </div>
              <div className={tone === 'positive' ? 'amount-positive' : 'amount-negative'} style={{ fontWeight: 850 }}>
                {formatLKR(row.balance)}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
