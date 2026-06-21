import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPeriodOptions, getReports, getTenantInfo, type ReportRow } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Card, PageHeading } from '@/components/ui/bookone-ui';
import { BookOpenCheck, Landmark, LineChart, ReceiptText, Scale } from 'lucide-react';

type ReportView = 'pnl' | 'balance' | 'cashflow' | 'ledger' | 'trial';

interface SearchParams {
  period?: string;
  report?: ReportView;
}

const reportTabs: { id: ReportView; label: string; icon: typeof LineChart }[] = [
  { id: 'pnl', label: 'Profit & Loss', icon: LineChart },
  { id: 'balance', label: 'Balance Sheet', icon: Landmark },
  { id: 'cashflow', label: 'Cash Flow', icon: ReceiptText },
  { id: 'ledger', label: 'General Ledger', icon: BookOpenCheck },
  { id: 'trial', label: 'Trial Balance', icon: Scale },
];

function formatLKR(value: number) {
  const sign = value < 0 ? '-' : '';
  return `${sign}LKR ${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function reportHref(period: string | undefined, report: ReportView) {
  const params = new URLSearchParams();
  if (period) params.set('period', period);
  params.set('report', report);
  return `/reports?${params.toString()}`;
}

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

  const activeReport = reportTabs.some((tab) => tab.id === params?.report) ? params.report! : 'pnl';
  const periodLabel = periodOptions.selected
    ? new Date(`${periodOptions.selected}-01`).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : 'All time';

  return (
    <BookOneShell active="Reports" tenant={tenant} period={periodOptions}>
      <div className="workspace">
        <PageHeading
          eyebrow="Insights"
          title="Reports"
          lead="Structured accounting reports from posted journals. Use Journal first to audit entries, then use these statements to verify final accounts."
        />

        <div className="report-tabs" role="tablist" aria-label="Report views">
          {reportTabs.map((tab) => (
            <Link className={`report-tab ${activeReport === tab.id ? 'active' : ''}`} href={reportHref(params?.period, tab.id)} key={tab.id}>
              <tab.icon size={16} />
              <span>{tab.label}</span>
            </Link>
          ))}
        </div>

        <div className="grid metrics" style={{ marginTop: 16 }}>
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
            <p className="metric-label">Ledger entries</p>
            <p className="metric-value">{data.generalLedger.length}</p>
            <p className="metric-note">Journal entries in view</p>
          </Card>
        </div>

        <Card style={{ marginTop: 16 }}>
          <div className="card-header">
            <div>
              <p className="eyebrow">{periodLabel}</p>
              <h2 className="card-title" style={{ marginTop: 4 }}>{reportTabs.find((tab) => tab.id === activeReport)?.label}</h2>
            </div>
            <Badge tone="info">Live from journals</Badge>
          </div>
          <div className="card-body">
            {activeReport === 'pnl' ? (
              <div className="statement-layout">
                <StatementSection title="Revenue" rows={data.income.revenue} normal="credit" />
                <StatementSection title="Expenses" rows={data.income.expense} normal="debit" />
                <StatementTotal label="Net income" value={data.income.netIncome} />
              </div>
            ) : null}

            {activeReport === 'balance' ? (
              <div className="statement-layout">
                <StatementSection title="Assets" rows={data.balanceSheet.assets} normal="debit" />
                <StatementTotal label="Total assets" value={data.balanceSheet.totalAssets} />
                <StatementSection title="Liabilities" rows={data.balanceSheet.liabilities} normal="credit" />
                <StatementSection title="Equity" rows={data.balanceSheet.equity} normal="credit" />
                <StatementTotal label="Liabilities + equity" value={data.balanceSheet.totalLiabilities + data.balanceSheet.totalEquity} />
              </div>
            ) : null}

            {activeReport === 'cashflow' ? (
              <div className="statement-layout">
                <StatementTotal label="Money in" value={data.cashFlow.moneyIn} />
                <StatementTotal label="Money out" value={-data.cashFlow.moneyOut} />
                <StatementTotal label="Net cash flow" value={data.cashFlow.netCashFlow} />
              </div>
            ) : null}

            {activeReport === 'ledger' ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Party</th>
                      <th>Memo</th>
                      <th>Lines</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.generalLedger.length === 0 ? (
                      <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>No journal entries yet.</td></tr>
                    ) : data.generalLedger.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.entryDate}</td>
                        <td>{entry.party}</td>
                        <td>{entry.memo}</td>
                        <td>{entry.lines.length}</td>
                        <td style={{ textAlign: 'right' }}>{formatLKR(entry.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {activeReport === 'trial' ? (
              <TrialBalanceTable rows={data.trialBalance} />
            ) : null}
          </div>
        </Card>
      </div>
    </BookOneShell>
  );
}

function StatementSection({ title, rows, normal }: { title: string; rows: ReportRow[]; normal: 'debit' | 'credit' }) {
  return (
    <section className="statement-section">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p>No {title.toLowerCase()} recorded.</p>
      ) : rows.map((row) => (
        <div className="statement-line" key={row.accountCode}>
          <span>{row.accountCode} - {row.accountName}</span>
          <strong className={normal === 'debit' ? 'amount-positive' : 'amount-positive'}>{formatLKR(row.balance)}</strong>
        </div>
      ))}
    </section>
  );
}

function StatementTotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="statement-total">
      <span>{label}</span>
      <strong className={value >= 0 ? 'amount-positive' : 'amount-negative'}>{formatLKR(value)}</strong>
    </div>
  );
}

function TrialBalanceTable({ rows }: { rows: ReportRow[] }) {
  return (
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
          {rows.length === 0 ? (
            <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>No data yet.</td></tr>
          ) : rows.map((row) => (
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
  );
}
