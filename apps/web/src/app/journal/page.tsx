import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPeriodOptions, getTenantInfo, listJournalEntries } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button } from '@/components/ui/bookone-ui';

function formatLKR(value: number) {
  return `LKR ${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  const monthLabel = periodOptions.label || 'All time';

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

  const allBalance = unbalancedCount === 0;

  return (
    <BookOneShell active="Journal" tenant={tenant} period={periodOptions}>
      <div className="workspace ux-page jr-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Journal</h1>
              <p>Every entry in your books{periodOptions.selected ? ` in ${monthLabel}` : ''}, with the accounts it moved money between. Open an entry to see its lines.</p>
            </div>
          </div>
          <div className="ux-head-actions">
            <Link href="/journal/audit" className="button secondary">
              Activity
            </Link>
          </div>
        </header>

        {entries.length === 0 ? (
          <div className="ux-empty">
            <h2>No journal entries {periodOptions.selected ? `in ${monthLabel}` : 'yet'}</h2>
            <p>Record money in or out in Simple Entry, or create an invoice, and the entry appears here.</p>
            <div className="cluster" style={{ gap: 8 }}>
              <Link href="/">
                <Button variant="primary">Go to Simple Entry</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="ux-split">
            <section className="ux-card" aria-labelledby="journal-list-title">
              <header className="ux-card-head">
                <h2 id="journal-list-title">Entries</h2>
                <span>{entries.length}</span>
              </header>
              <div className="journal-audit-list jr-list">
                {audited.map(({ entry, debit, credit, difference, balanced }, index) => (
                  <details className={`journal-audit-row ${balanced ? '' : 'problem'}`} key={entry.id} open={index === 0}>
                    <summary>
                      <span className="audit-row-main">
                        <strong>
                          {entry.entryDate} · {entry.party}
                        </strong>
                        <small>{entry.description}</small>
                      </span>
                      <span>{entry.accountingType}</span>
                      <span className="jr-amount">{formatLKR(entry.amount)}</span>
                      <Badge tone={balanced ? 'success' : 'danger'}>
                        {balanced ? 'Balanced' : `Off by ${formatLKR(difference)}`}
                      </Badge>
                    </summary>
                    <div className="audit-row-detail">
                      {entry.memo ? <p className="jr-memo">{entry.memo}</p> : null}
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Account</th>
                              <th>Note</th>
                              <th style={{ textAlign: 'right' }}>Debit</th>
                              <th style={{ textAlign: 'right' }}>Credit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.lines.map((line) => (
                              <tr key={line.id}>
                                <td>
                                  {line.accountName} <span className="muted-line">({line.accountCode})</span>
                                </td>
                                <td style={{ color: 'var(--ink-muted)' }}>{line.memo ?? '—'}</td>
                                <td className="jr-num">{line.side === 'debit' ? formatLKR(line.amount) : ''}</td>
                                <td className="jr-num">{line.side === 'credit' ? formatLKR(line.amount) : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={2}>Total</td>
                              <td className="jr-num">{formatLKR(debit)}</td>
                              <td className="jr-num">{formatLKR(credit)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </section>

            <aside className="ux-guide jr-summary" aria-label="Journal check">
              <h2>{monthLabel}</h2>
              <dl className="ux-statement">
                <div>
                  <dt>Entries </dt>
                  <dd>{entries.length}</dd>
                </div>
                <div>
                  <dt>Debits </dt>
                  <dd>{formatLKR(totalDebit)}</dd>
                </div>
                <div>
                  <dt>Credits </dt>
                  <dd>{formatLKR(totalCredit)}</dd>
                </div>
                <div className="is-total">
                  <dt>Difference </dt>
                  <dd>
                    {formatLKR(totalDebit - totalCredit)} {allBalance ? '✓' : ''}
                  </dd>
                </div>
              </dl>
              <p className={`jr-verdict ${allBalance ? 'is-good' : 'is-bad'}`} role="status">
                {allBalance
                  ? `All ${entries.length} entr${entries.length === 1 ? 'y balances' : 'ies balance'}: debits equal credits.`
                  : `${unbalancedCount} entr${unbalancedCount === 1 ? 'y does' : 'ies do'} not balance. They are marked in red; open one to see its lines.`}
              </p>
            </aside>
          </div>
        )}
      </div>
    </BookOneShell>
  );
}
