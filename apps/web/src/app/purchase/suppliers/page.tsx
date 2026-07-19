import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupplierPerformance } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { formatLKR } from '@/components/module/list-page';
import { Card } from '@/components/ui/bookone-ui';

export default async function SupplierPerformancePage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), getSupplierPerformance()]);
  } catch {
    redirect('/login');
  }

  const totalSpend = rows.reduce((s, r) => s + r.purchaseTotal, 0);
  const totalOpen = rows.reduce((s, r) => s + r.openAp, 0);

  return (
    <BookOneShell active="Suppliers" tenant={tenant}>
      <div className="workspace party-workspace">
        <div className="party-toolbar">
          <div className="party-search-form">
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)' }}>
              Supplier performance · spend {formatLKR(totalSpend)} · open AP {formatLKR(totalOpen)}
            </span>
          </div>
          <Link href="/parties/vendors" style={{ fontSize: 13, fontWeight: 700 }}>
            Vendor master →
          </Link>
        </div>

        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            {rows.length === 0 ? (
              <div className="empty-state" style={{ padding: 28 }}>
                <h3>No supplier activity yet</h3>
                <p>Post purchases and returns to build performance stats.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th>Bills</th>
                      <th>Purchase total</th>
                      <th>Open AP</th>
                      <th>Returns</th>
                      <th>Return total</th>
                      <th>On-time pay %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.partyId}>
                        <td>
                          <strong>{r.partyName}</strong>
                        </td>
                        <td>{r.billCount}</td>
                        <td>{formatLKR(r.purchaseTotal)}</td>
                        <td>{formatLKR(r.openAp)}</td>
                        <td>{r.returnCount}</td>
                        <td>{formatLKR(r.returnTotal)}</td>
                        <td>
                          {r.onTimePct == null ? (
                            <span style={{ color: 'var(--ink-soft)' }}>—</span>
                          ) : (
                            <strong
                              style={{
                                color:
                                  r.onTimePct >= 80
                                    ? 'var(--success, #15835f)'
                                    : r.onTimePct >= 50
                                      ? 'var(--warning, #b45309)'
                                      : 'var(--danger, #b91c1c)',
                              }}
                            >
                              {r.onTimePct}%
                            </strong>
                          )}
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                            {r.paidOnTime} on time · {r.paidLate} late
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
          On-time % uses fully paid bills: payment date (last update) vs due date. Lite metric for SME
          review — not a contractual SLA report.
        </p>
      </div>
    </BookOneShell>
  );
}
