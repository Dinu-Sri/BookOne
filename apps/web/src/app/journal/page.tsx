import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPeriodOptions, getTenantInfo, listJournalEntries } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { PeriodSelector } from '@/components/layout/period-selector';
import { Badge, Button, Card, PageHeading } from '@/components/ui/bookone-ui';
import { CheckCircle2 } from 'lucide-react';

function formatLKR(value: number) {
  return `LKR ${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

interface SearchParams { period?: string }

export default async function JournalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  let tenant;
  let entries;
  let periodOptions;
  try {
    [tenant, entries, periodOptions] = await Promise.all([
      getTenantInfo(),
      listJournalEntries(params?.period),
      getPeriodOptions(params?.period),
    ]);
  } catch (err) {
    redirect('/login');
  }

  const monthLabel = periodOptions.selected
    ? new Date(periodOptions.selected + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : 'All time';

  return (
    <BookOneShell active="Journal" tenant={tenant} period={periodOptions}>
      <div className="workspace">
        <PageHeading
          eyebrow="Audit"
          title="Journal"
          lead="Every posted journal entry, with both sides of the double-entry lines. All amounts are guaranteed to balance."
          actions={
            <PeriodSelector selected={periodOptions.selected} available={periodOptions.available} />
          }
        />

        {entries.length === 0 ? (
          <Card>
            <div className="empty-state">
              <h3>No journal entries {periodOptions.selected ? `in ${monthLabel}` : 'yet'}</h3>
              <p>Record your first entry to see a balanced journal here.</p>
              <Link href="/"><Button variant="primary" style={{ marginTop: 14 }}>Go to Simple Entry</Button></Link>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {entries.map((entry) => {
              const totalDebit = entry.lines.reduce((s, l) => s + (l.side === 'debit' ? l.amount : 0), 0);
              const totalCredit = entry.lines.reduce((s, l) => s + (l.side === 'credit' ? l.amount : 0), 0);
              const balanced = Math.abs(totalDebit - totalCredit) < 0.005;
              return (
                <Card key={entry.id}>
                  <div style={{ padding: '16px 18px 0' }}>
                    <div className="cluster" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <p className="eyebrow">{entry.date} · {entry.direction}</p>
                        <h2 className="card-title" style={{ marginTop: 4 }}>{entry.party} — {entry.description}</h2>
                      </div>
                      <Badge tone={balanced ? 'success' : 'danger'}>
                        <CheckCircle2 size={12} /> {balanced ? 'Balanced' : 'Unbalanced'}
                      </Badge>
                    </div>
                    <p style={{ color: 'var(--ink-muted)', fontSize: 12, marginTop: 4 }}>{entry.memo}</p>
                  </div>
                  <div className="card-body">
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Account</th>
                            <th>Side</th>
                            <th>Memo</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.lines.map((ln) => (
                            <tr key={ln.id}>
                              <td>{ln.accountCode} — {ln.accountName}</td>
                              <td>
                                <Badge tone={ln.side === 'debit' ? 'info' : 'warning'}>{ln.side}</Badge>
                              </td>
                              <td style={{ color: 'var(--ink-muted)' }}>{ln.memo ?? '—'}</td>
                              <td style={{ textAlign: 'right' }} className={ln.side === 'debit' ? 'amount-positive' : 'amount-negative'}>
                                {formatLKR(ln.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={3} style={{ fontWeight: 850, color: 'var(--ink-muted)' }}>Totals</td>
                            <td style={{ textAlign: 'right', fontWeight: 850 }}>
                              {formatLKR(totalDebit)} = {formatLKR(totalCredit)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </BookOneShell>
  );
}
