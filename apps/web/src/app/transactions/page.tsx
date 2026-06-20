import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPeriodOptions, getTenantInfo, listTransactions } from '@/app/actions/workspace';
import { reverseTransactionFromForm } from '@/app/actions/record-entry';
import { getReceiptDownloadUrl } from '@/app/actions/upload-receipt';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button, Card, PageHeading } from '@/components/ui/bookone-ui';
import { Paperclip, RotateCcw, Search } from 'lucide-react';

function formatLKR(value: number) {
  return `LKR ${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function directionTone(direction: string): 'success' | 'danger' | 'info' {
  if (direction === 'money_in') return 'success';
  if (direction === 'money_out') return 'danger';
  if (direction === 'move_money') return 'info';
  return 'info';
}

interface SearchParams {
  period?: string;
  q?: string;
  party?: string;
  account?: string;
  confidence?: 'low' | 'all';
  receipt?: 'missing' | 'attached' | 'all';
  reconciliation?: 'reconciled' | 'unreconciled' | 'all';
}

function filterHref(current: SearchParams, next: Partial<SearchParams>) {
  const params = new URLSearchParams();
  const merged = { ...current, ...next };
  for (const [key, value] of Object.entries(merged)) {
    if (value && value !== 'all') params.set(key, value);
  }
  const query = params.toString();
  return query ? `/transactions?${query}` : '/transactions';
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  let tenant;
  let txs;
  let periodOptions;
  let receiptUrls: Record<string, string | null> = {};

  try {
    [tenant, txs, periodOptions] = await Promise.all([
      getTenantInfo(),
      listTransactions(params),
      getPeriodOptions(params?.period),
    ]);

    const receiptEntries = await Promise.all(
      txs
        .filter((tx) => tx.receiptRef)
        .map(async (tx) => [tx.id, await getReceiptDownloadUrl(tx.receiptRef as string)] as const),
    );
    receiptUrls = Object.fromEntries(receiptEntries);
  } catch {
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
          lead="Review posted entries by period, receipt, confidence, reconciliation status, party, and account."
        />

        <Card>
          <div className="card-body" style={{ borderBottom: '1px solid var(--line)' }}>
            <form className="filter-bar">
              {params?.period ? <input type="hidden" name="period" value={params.period} /> : null}
              <div className="search-field">
                <Search size={15} />
                <input className="input" name="q" defaultValue={params?.q ?? ''} placeholder="Search party or description" />
              </div>
              <input className="input" name="party" defaultValue={params?.party ?? ''} placeholder="Party" />
              <input className="input" name="account" defaultValue={params?.account ?? ''} placeholder="Account code" />
              <Button variant="secondary" type="submit">Filter</Button>
              <Link
                className="button ghost"
                href={filterHref(params ?? {}, { q: undefined, party: undefined, account: undefined, confidence: 'all', receipt: 'all', reconciliation: 'all' })}
              >
                Clear
              </Link>
            </form>
            <div className="filter-chips">
              <Link className={`chip ${params?.confidence === 'low' ? 'active' : ''}`} href={filterHref(params ?? {}, { confidence: params?.confidence === 'low' ? 'all' : 'low' })}>
                Low confidence
              </Link>
              <Link className={`chip ${params?.receipt === 'missing' ? 'active' : ''}`} href={filterHref(params ?? {}, { receipt: params?.receipt === 'missing' ? 'all' : 'missing' })}>
                Missing receipt
              </Link>
              <Link className={`chip ${params?.reconciliation === 'unreconciled' ? 'active' : ''}`} href={filterHref(params ?? {}, { reconciliation: params?.reconciliation === 'unreconciled' ? 'all' : 'unreconciled' })}>
                Unreconciled
              </Link>
            </div>
          </div>
          <div className="card-body">
            {txs.length === 0 ? (
              <div className="empty-state">
                <h3>No transactions {periodOptions.selected ? `in ${monthLabel}` : 'yet'}</h3>
                <p>Record your first entry from the Simple Entry page.</p>
                <Link href="/"><Button variant="primary" style={{ marginTop: 14 }}>Go to Simple Entry</Button></Link>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table review-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Party</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Account</th>
                      <th>Type</th>
                      <th>Review</th>
                      <th>Receipt</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx) => {
                      const receiptUrl = receiptUrls[tx.id];
                      const canReverse = !tx.reversedByTransactionId && !tx.reversesTransactionId;

                      return (
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
                                    {tx.categorySource === 'override' ? ' - override' : ''}
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--ink-soft)' }}>-</span>
                            )}
                          </td>
                          <td style={{ color: 'var(--ink-muted)' }}>{tx.paymentAccountCode} {tx.paymentAccountName}</td>
                          <td>
                            <Badge tone={directionTone(tx.direction)}>{tx.accountingType}</Badge>
                          </td>
                          <td>
                            <div className="status-stack">
                              {tx.isPeriodLocked ? <Badge tone="warning">Locked</Badge> : <Badge tone="info">Open</Badge>}
                              {tx.reconciliationStatus ? <Badge tone="success">Reconciled</Badge> : <Badge tone="neutral">Unreconciled</Badge>}
                              {tx.reversedByTransactionId ? <Badge tone="danger">Reversed</Badge> : null}
                              {tx.reversesTransactionId ? <Badge tone="info">Reversal</Badge> : null}
                            </div>
                          </td>
                          <td>
                            {tx.receiptRef && receiptUrl ? (
                              <Link className="receipt-link" href={receiptUrl} target="_blank" rel="noreferrer">
                                <Paperclip size={14} aria-hidden /> View
                              </Link>
                            ) : tx.receiptRef ? (
                              <span className="receipt-link muted"><Paperclip size={14} aria-hidden /> Attached</span>
                            ) : (
                              <span style={{ color: 'var(--ink-soft)' }}>-</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={tx.direction === 'money_in' ? 'amount-positive' : tx.direction === 'money_out' ? 'amount-negative' : ''}>
                              {tx.direction === 'money_in' ? '+' : tx.direction === 'money_out' ? '-' : ''}
                              {formatLKR(tx.amount)}
                            </span>
                          </td>
                          <td>
                            {canReverse ? (
                              <form action={reverseTransactionFromForm}>
                                <input type="hidden" name="transactionId" value={tx.id} />
                                <Button variant="ghost" type="submit" className="table-icon-action" aria-label={`Reverse ${tx.description}`}>
                                  <RotateCcw size={14} aria-hidden /> Reverse
                                </Button>
                              </form>
                            ) : (
                              <span style={{ color: 'var(--ink-soft)' }}>-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
