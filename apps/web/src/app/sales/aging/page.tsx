import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getArAgingSummary } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { formatLKR, StatusBadge, todayString } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

const BUCKET_LABEL: Record<string, string> = {
  current: 'Current',
  d1_30: '1–30 days',
  d31_60: '31–60 days',
  d61_90: '61–90 days',
  d90_plus: '90+ days',
};

export default async function ArAgingPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string; bucket?: string }>;
}) {
  const sp = await searchParams;
  const asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf) ? sp.asOf : todayString();
  let tenant;
  let aging;
  try {
    [tenant, aging] = await Promise.all([getTenantInfo(), getArAgingSummary(asOf)]);
  } catch {
    redirect('/login');
  }

  const filterBucket = sp.bucket && sp.bucket in BUCKET_LABEL ? sp.bucket : null;
  const rows = filterBucket ? aging.rows.filter((r) => r.bucket === filterBucket) : aging.rows;

  return (
    <BookOneShell active="AR Aging" tenant={tenant}>
      <div className="workspace party-workspace">
        <div className="party-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
          <form className="party-search-form" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
              As of
              <input
                className="input"
                type="date"
                name="asOf"
                defaultValue={asOf}
                style={{ marginLeft: 8 }}
              />
            </label>
            <Button variant="secondary" type="submit">
              Refresh
            </Button>
          </form>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Link href="/sales/payments/new">
              <Button variant="primary" type="button">
                Receive payment
              </Button>
            </Link>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10,
            marginBottom: 12,
          }}
        >
          {(Object.keys(BUCKET_LABEL) as Array<keyof typeof BUCKET_LABEL>).map((key) => {
            const active = filterBucket === key;
            const href = active
              ? `/sales/aging?asOf=${asOf}`
              : `/sales/aging?asOf=${asOf}&bucket=${key}`;
            return (
              <Link key={key} href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
                <Card>
                  <div className="card-body" style={{ padding: 12 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: active ? 'var(--brand)' : 'var(--ink-soft)',
                      }}
                    >
                      {BUCKET_LABEL[key]}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>
                      {formatLKR(aging.totals[key as keyof typeof aging.totals])}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
          <Card>
            <div className="card-body" style={{ padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>Total open AR</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>
                {formatLKR(aging.grandTotal)}
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            {rows.length === 0 ? (
              <div className="empty-state" style={{ padding: 28 }}>
                <h3>No open receivables</h3>
                <p>All invoices are paid, or none posted yet.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Due / age date</th>
                      <th>Days</th>
                      <th>Bucket</th>
                      <th>Balance</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/sales/invoices/${r.id}`}>
                            <strong>{r.documentNumber}</strong>
                          </Link>
                        </td>
                        <td>{r.partyName}</td>
                        <td>{r.agingDate}</td>
                        <td>{r.daysPastDue}</td>
                        <td>
                          <StatusBadge status={BUCKET_LABEL[r.bucket]} />
                        </td>
                        <td>{formatLKR(r.balanceDue)}</td>
                        <td>
                          <Link href={`/sales/payments/new?documentId=${r.id}`}>
                            <Button variant="secondary" type="button">
                              Receive
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
