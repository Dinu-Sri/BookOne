import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPeriodOptions, getTenantInfo, listJournalEntries } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button, Card } from '@/components/ui/bookone-ui';
import { ListChecks } from 'lucide-react';

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
  } catch {
    redirect('/login');
  }

  const monthLabel = periodOptions.selected
    ? new Date(periodOptions.selected + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : 'All time';

  const audited = entries.map((entry) => {
    const debit = entry.lines.reduce((sum, line) => sum + (line.side === 'debit' ? line.amount : 0), 0);
    const credit = entry.lines.reduce((sum, line) => sum + (line.side === 'credit' ? line.amount : 0), 0);
    const difference = debit - credit;
    const balanced = Math.abs(difference) < 0.005 && entry.lines.length >= 2;
    return { entry, debit, credit, difference, balanced };
  });

  const totalDebit = audited.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = audited.reduce((sum, row) => sum + row.credit, 0);
  const unbalancedCount = audited.filter((row) => !row.balanced).length;
  const accountSet = new Set(entries.flatMap((entry) => entry.lines.map((line) => line.accountCode)));

  return (
    <BookOneShell active="Journal" tenant={tenant} period={periodOptions}>
      <div className="workspace">
        <div className="grid metrics">
          <Card className="metric-card">
            <p className="metric-label">Journal entries</p>
            <p className="metric-value">{entries.length}</p>
            <p className="metric-note">{monthLabel}</p>
          </Card>
          <Card className="metric-card">
            <p className="metric-label">Integrity</p>
            <p className="metric-value">{unbalancedCount === 0 ? 'OK' : unbalancedCount}</p>
            <p className="metric-note">{unbalancedCount === 0 ? 'All entries balance' : 'Entries need review'}</p>
          </Card>
          <Card className="metric-card">
            <p className="metric-label">Total debits</p>
            <p className="metric-value">{formatLKR(totalDebit)}</p>
            <p className="metric-note">Must equal credits</p>
          </Card>
          <Card className="metric-card">
            <p className="metric-label">Accounts touched</p>
            <p className="metric-value">{accountSet.size}</p>
            <p className="metric-note">Unique ledger accounts</p>
          </Card>
        </div>

        {entries.length === 0 ? (
          <Card style={{ marginTop: 16 }}>
            <div className="empty-state">
              <h3>No journal entries {periodOptions.selected ? `in ${monthLabel}` : 'yet'}</h3>
              <p>Record your first entry to see a balanced journal audit here.</p>
              <Link href="/"><Button variant="primary" style={{ marginTop: 14 }}>Go to Simple Entry</Button></Link>
            </div>
          </Card>
        ) : (
          <Card style={{ marginTop: 16 }}>
            <div className="card-header">
              <div>
                <p className="eyebrow">Ledger audit table</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Entries</h2>
              </div>
              <Badge tone="info"><ListChecks size={12} /> Expand rows</Badge>
            </div>
            <div className="card-body">
              <div className="journal-audit-list">
                {audited.map(({ entry, debit, credit, difference, balanced }, index) => (
                  <details className={`journal-audit-row ${balanced ? '' : 'problem'}`} key={entry.id} open={index === 0}>
                    <summary>
                      <span className="audit-row-main">
                        <strong>{entry.entryDate} - {entry.party}</strong>
                        <small>{entry.description}</small>
                      </span>
                      <span>{entry.accountingType}</span>
                      <span>{formatLKR(entry.amount)}</span>
                      <Badge tone={balanced ? 'success' : 'danger'}>
                        {balanced ? 'Balanced' : formatLKR(difference)}
                      </Badge>
                    </summary>
                    <div className="audit-row-detail">
                      <div className="audit-meta">
                        <span><ClipboardCheck size={13} /> {entry.memo}</span>
                        <span>Debit {formatLKR(debit)}</span>
                        <span>Credit {formatLKR(credit)}</span>
                      </div>
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Account</th>
                              <th>Side</th>
                              <th>Memo</th>
                              <th style={{ textAlign: 'right' }}>Debit</th>
                              <th style={{ textAlign: 'right' }}>Credit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.lines.map((line) => (
                              <tr key={line.id}>
                                <td>{line.accountCode} - {line.accountName}</td>
                                <td><Badge tone={line.side === 'debit' ? 'info' : 'warning'}>{line.side}</Badge></td>
                                <td style={{ color: 'var(--ink-muted)' }}>{line.memo ?? '-'}</td>
                                <td style={{ textAlign: 'right' }}>{line.side === 'debit' ? formatLKR(line.amount) : '-'}</td>
                                <td style={{ textAlign: 'right' }}>{line.side === 'credit' ? formatLKR(line.amount) : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </BookOneShell>
  );
}
