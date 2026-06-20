import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPeriodOptions, getTenantInfo, listTransactions } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button, Card, PageHeading } from '@/components/ui/bookone-ui';
import { Paperclip } from 'lucide-react';

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

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  let tenant;
  let txs;
  let periodOptions;
  try {
    [tenant, txs, periodOptions] = await Promise.all([
      getTenantInfo(),
      listTransactions(params?.period),
      getPeriodOptions(params?.period),
    ]);
  } catch (err) {
    redirect('/login');
  }

  const monthLabel = periodOptions.selected
    ? new Date(periodOptions.selected + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : 'All time';

  return (
    <BookOneShell active="Transactions" tenant={tenant} period={periodOptions}>
      <div className="workspace">
        <PageHeading
          eyebrow="Records"
          title="Transactions"
          lead="Every entry you have posted, sorted newest first. Click a row to see the journal."
        />

        <Card>
          <div className="card-body">
            {txs.length === 0 ? (
              <div className="empty-state">
                <h3>No transactions {periodOptions.selected ? `in ${monthLabel}` : 'yet'}</h3>
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
