import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantInfo, listTransactions } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button, Card, PageHeading, SelectLike } from '@/components/ui/bookone-ui';
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Paperclip } from 'lucide-react';

function formatLKR(value: number) {
  return `LKR ${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function directionTone(direction: string): 'success' | 'danger' | 'info' {
  if (direction === 'money_in') return 'success';
  if (direction === 'money_out') return 'danger';
  if (direction === 'move_money') return 'info';
  return 'info';
}

interface SearchParams { period?: string }

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  let tenant;
  let txs;
  try {
    [tenant, txs] = await Promise.all([
      getTenantInfo(),
      listTransactions(searchParams?.period),
    ]);
  } catch (err) {
    redirect('/login');
  }

  const period = searchParams?.period;
  const monthLabel = period
    ? new Date(period + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : 'All time';

  return (
    <BookOneShell active="Transactions" tenant={tenant}>
      <div className="workspace">
        <PageHeading
          eyebrow="Records"
          title="Transactions"
          lead="Every entry you have posted, sorted newest first. Click a row to see the journal."
          actions={
            <div className="cluster">
              {period ? (
                <Link href="/transactions">
                  <Button variant="secondary"><ChevronLeft size={14} /> All time</Button>
                </Link>
              ) : null}
              <SelectLike>
                <span className="cluster"><CalendarDays size={16} /> {monthLabel}</span>
              </SelectLike>
            </div>
          }
        />

        <Card>
          <div className="card-body">
            {txs.length === 0 ? (
              <div className="empty-state">
                <h3>No transactions {period ? 'in this period' : 'yet'}</h3>
                <p>Record your first entry from the Simple Entry page.</p>
                <Link href="/"><Button variant="primary" style={{ marginTop: 14 }}>Go to Simple Entry</Button></Link>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Party</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Account</th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx) => (
                      <tr key={tx.id}>
                        <td>{tx.date}</td>
                        <td>{tx.party}</td>
                        <td style={{ color: 'var(--ink-muted)' }}>{tx.description}</td>
                        <td>
                          {tx.categoryName ? (
                            <span>
                              {tx.categoryName}
                              {tx.categoryConfidence != null ? (
                                <span style={{ color: 'var(--ink-soft)', fontSize: 11, marginLeft: 6 }}>
                                  {Math.round(tx.categoryConfidence * 100)}%
                                  {tx.categorySource === 'override' ? ' · override' : ''}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--ink-soft)' }}>—</span>
                          )}
                        </td>
                        <td style={{ color: 'var(--ink-muted)' }}>{tx.paymentAccountCode} {tx.paymentAccountName}</td>
                        <td>
                          <Badge tone={directionTone(tx.direction)}>{tx.accountingType}</Badge>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={tx.direction === 'money_in' ? 'amount-positive' : tx.direction === 'money_out' ? 'amount-negative' : ''}>
                            {tx.direction === 'money_in' ? '+' : tx.direction === 'money_out' ? '-' : ''}
                            {formatLKR(tx.amount)}
                          </span>
                        </td>
                        <td>
                          {tx.receiptRef ? (
                            <Paperclip size={14} color="var(--brand)" aria-label="Receipt attached" />
                          ) : (
                            <span style={{ color: 'var(--ink-soft)' }}>—</span>
                          )}
                        </td>
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
