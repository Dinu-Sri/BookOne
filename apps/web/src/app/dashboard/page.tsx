import { ArrowDownLeft, ArrowUpRight, BookOpenCheck, CircleAlert, ClipboardList, Landmark, LayoutDashboard, LineChart, ReceiptText, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getDashboardData } from '@/app/actions/workspace';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button, Card, MetricCard, PageHeading, Progress, SelectLike } from '@/components/ui/bookone-ui';

function formatLKR(value: number) {
  return `LKR ${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function directionTone(direction: string): 'success' | 'danger' | 'info' {
  if (direction === 'money_in') return 'success';
  if (direction === 'money_out') return 'danger';
  if (direction === 'move_money') return 'info';
  return 'info';
}

export default async function DashboardPage() {
  let data;
  let tenant;
  try {
    [data, tenant] = await Promise.all([getDashboardData(), getTenantInfo()]);
  } catch (err) {
    redirect('/login');
  }

  const monthLabel = new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' });

  return (
    <BookOneShell active="Dashboard" tenant={tenant}>
      <div className="workspace">
        <PageHeading
          eyebrow="Workspace"
          title="Dashboard"
          lead="A real-time picture of your business. All numbers are derived from your posted journal entries."
          actions={
            <SelectLike>
              <span className="cluster"><LayoutDashboard size={16} /> {monthLabel}</span>
            </SelectLike>
          }
        />

        <div className="grid metrics">
          {data.metrics.map((m) => (
            <MetricCard key={m.label} label={m.label} value={m.value} note={m.note} tone={m.tone} />
          ))}
        </div>

        <div className="grid board" style={{ marginTop: 18 }}>
          <Card>
            <div style={{ padding: '18px 18px 0' }}>
              <p className="eyebrow">Recent activity</p>
              <h2 className="card-title" style={{ marginTop: 4 }}>Last 10 transactions</h2>
            </div>
            <div className="card-body">
              {data.recentTransactions.length === 0 ? (
                <div className="empty-state">
                  <ReceiptText size={28} color="var(--ink-soft)" />
                  <h3>No transactions yet</h3>
                  <p>Use Simple Entry to record your first transaction.</p>
                  <Link href="/">
                    <Button variant="primary" style={{ marginTop: 14 }}>
                      Record your first entry
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Party</th>
                        <th>Description</th>
                        <th>Type</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentTransactions.map((tx) => (
                        <tr key={tx.id}>
                          <td>{tx.date}</td>
                          <td>{tx.party}</td>
                          <td style={{ color: 'var(--ink-muted)' }}>{tx.description}</td>
                          <td>
                            <Badge tone={directionTone(tx.direction)}>{tx.type}</Badge>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={tx.direction === 'money_in' ? 'amount-positive' : 'amount-negative'}>
                              {tx.direction === 'money_in' ? '+' : tx.direction === 'money_out' ? '-' : ''}
                              {formatLKR(tx.amount)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>

          <div className="review-rail">
            <Card>
              <div className="card-body">
                <p className="eyebrow">Alerts</p>
                {data.lowConfidenceCount > 0 ? (
                  <div className="alert-list" style={{ marginTop: 12 }}>
                    <div className="alert-row">
                      <div>
                        <strong>
                          <CircleAlert size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                          {data.lowConfidenceCount} low-confidence categor{data.lowConfidenceCount === 1 ? 'y' : 'ies'}
                        </strong>
                        <span>Engine is not sure. Review on the Journal page.</span>
                      </div>
                      <Link href="/journal"><Button variant="secondary">Review</Button></Link>
                    </div>
                  </div>
                ) : (
                  <div className="alert-list" style={{ marginTop: 12 }}>
                    <div className="alert-row">
                      <div>
                        <strong>All categories look confident</strong>
                        <span>Engine matched every entry above 70%.</span>
                      </div>
                      <Badge tone="success">Good</Badge>
                    </div>
                  </div>
                )}
                <div className="alert-list" style={{ marginTop: 12 }}>
                  <div className="alert-row">
                    <div>
                      <strong>Tenant</strong>
                      <span>{tenant.name} ({tenant.plan})</span>
                    </div>
                    <Badge tone="info">{tenant.slug}</Badge>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="card-body">
                <p className="eyebrow">Quick links</p>
                <div className="nav-list" style={{ marginTop: 12 }}>
                  <Link className="nav-item" href="/transactions"><ClipboardList size={16} /> Transactions</Link>
                  <Link className="nav-item" href="/journal"><BookOpenCheck size={16} /> Journal</Link>
                  <Link className="nav-item" href="/reports"><LineChart size={16} /> Reports</Link>
                  <Link className="nav-item" href="/accounts"><Landmark size={16} /> Accounts</Link>
                  <Link className="nav-item" href="/reconciliation"><ShieldCheck size={16} /> Reconciliation</Link>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </BookOneShell>
  );
}
