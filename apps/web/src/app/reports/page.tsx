import { redirect } from 'next/navigation';
import { getPeriodOptions, getReports, getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { PeriodSelector } from '@/components/layout/period-selector';
import { Badge, Card, PageHeading, SelectLike } from '@/components/ui/bookone-ui';
import { LineChart } from 'lucide-react';

function formatLKR(value: number) {
  return `LKR ${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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
  } catch (err) {
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
          lead="Real-time financial statements computed from your posted journals. As you record more entries, these update automatically."
          actions={
            <PeriodSelector selected={periodOptions.selected} available={periodOptions.available} />
          }
        />

        <div className="grid board">
          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">Profit & Loss</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Income statement</h2>
                <p className="card-subtitle">{periodLabel}</p>
              </div>
              <Badge tone={data.income.netIncome >= 0 ? 'success' : 'danger'}>
                {data.income.netIncome >= 0 ? 'Profit' : 'Loss'} · {formatLKR(data.income.netIncome)}
              </Badge>
            </div>
            <div className="card-body">
              <p style={{ fontSize: 12, fontWeight: 850, color: 'var(--ink-muted)', marginBottom: 8 }}>REVENUE</p>
              {data.income.revenue.length === 0 ? (
                <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No revenue recorded.</p>
              ) : (
                <div style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
                  {data.income.revenue.map((r) => (
                    <div key={r.accountCode} className="balance-row" style={{ padding: '8px 12px' }}>
                      <div>
                        <strong>{r.accountName}</strong>
                        <span>{r.accountCode}</span>
                      </div>
                      <div className="amount-positive" style={{ fontWeight: 850 }}>
                        {formatLKR(r.balance)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 12, fontWeight: 850, color: 'var(--ink-muted)', marginBottom: 8 }}>EXPENSES</p>
              {data.income.expense.length === 0 ? (
                <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No expenses recorded.</p>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {data.income.expense.map((e) => (
                    <div key={e.accountCode} className="balance-row" style={{ padding: '8px 12px' }}>
                      <div>
                        <strong>{e.accountName}</strong>
                        <span>{e.accountCode}</span>
                      </div>
                      <div className="amount-negative" style={{ fontWeight: 850 }}>
                        {formatLKR(e.balance)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">Accounting</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Trial balance</h2>
              </div>
              <SelectLike>
                <span className="cluster"><LineChart size={16} /> {periodLabel}</span>
              </SelectLike>
            </div>
            <div className="card-body">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th style={{ textAlign: 'right' }}>Debit</th>
                      <th style={{ textAlign: 'right' }}>Credit</th>
                      <th style={{ textAlign: 'right' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.trialBalance.length === 0 ? (
                      <tr><td colSpan={4} style={{ color: 'var(--ink-soft)' }}>No data yet.</td></tr>
                    ) : data.trialBalance.map((row) => (
                      <tr key={row.accountCode}>
                        <td>{row.accountCode} — {row.accountName}</td>
                        <td style={{ textAlign: 'right' }}>{row.debit ? formatLKR(row.debit) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{row.credit ? formatLKR(row.credit) : '—'}</td>
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
      </div>
    </BookOneShell>
  );
}
