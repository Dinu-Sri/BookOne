import { redirect } from 'next/navigation';
import Link from 'next/link';
import { listPosShifts } from '@/app/actions/pos-session';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

export default async function PosShiftsPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listPosShifts(50)]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="POS History" tenant={tenant}>
      <div className="workspace party-workspace">
        <div className="party-toolbar">
          <div className="party-search-form">
            <input className="input party-search" placeholder="POS shifts…" disabled />
          </div>
          <Link href="/pos">
            <Button variant="primary" type="button">
              Open POS
            </Button>
          </Link>
          <Link href="/sales/pos">
            <Button variant="secondary" type="button">
              Ticket history
            </Button>
          </Link>
        </div>
        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            {rows.length === 0 ? (
              <div className="empty-state" style={{ padding: 28 }}>
                <h3>No shifts yet</h3>
                <p>Open a shift from the POS terminal to start selling.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Register</th>
                      <th>Status</th>
                      <th>Opened</th>
                      <th>Closed</th>
                      <th>Float</th>
                      <th>Expected</th>
                      <th>Counted</th>
                      <th>Variance</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.registerCode}</strong>
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{r.registerName}</div>
                        </td>
                        <td>
                          <StatusBadge status={r.status === 'open' ? 'open' : 'closed'} />
                        </td>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {new Date(r.openedAt).toLocaleString()}
                        </td>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {r.closedAt ? new Date(r.closedAt).toLocaleString() : '—'}
                        </td>
                        <td>{formatLKR(r.openingFloat)}</td>
                        <td>{r.expectedCash != null ? formatLKR(r.expectedCash) : '—'}</td>
                        <td>{r.closingCashCount != null ? formatLKR(r.closingCashCount) : '—'}</td>
                        <td>
                          {r.varianceCash != null ? (
                            <span
                              style={{
                                fontWeight: 700,
                                color:
                                  r.varianceCash === 0
                                    ? 'var(--success)'
                                    : r.varianceCash > 0
                                      ? 'var(--info)'
                                      : 'var(--danger)',
                              }}
                            >
                              {formatLKR(r.varianceCash)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <Link href={`/pos/z-report/${r.id}`}>
                            <Button variant="secondary" type="button">
                              Z-report
                            </Button>
                          </Link>
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
