'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui/bookone-ui';

type CalEvent = {
  id: string;
  documentId: string;
  hireFrom: string;
  hireTo: string;
  eventDate: string | null;
  venue: string | null;
  guestCount: number | null;
  documentNumber: string;
  documentType: string;
  partyName: string;
  status: string;
};

type CalBar = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  qty: number;
  hireFrom: string;
  hireTo: string;
  documentNumber: string;
  status: string;
};

function daysInMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y!, m! - 1, 1);
  const last = new Date(y!, m!, 0).getDate();
  const startPad = first.getDay();
  return { y: y!, m: m!, last, startPad };
}

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function href(month: string, productId: string | null) {
  const q = new URLSearchParams({ month });
  if (productId) q.set('productId', productId);
  return `/inventory/calendar?${q}`;
}

function docHref(type: string, id: string) {
  if (type === 'quotation') return `/sales/quotations/${id}`;
  if (type === 'sales_order') return `/sales/orders/${id}`;
  return `/sales/invoices/${id}`;
}

export function RentalCalendar({
  month,
  productId,
  products,
  events,
  bars,
}: {
  month: string;
  productId: string | null;
  products: { id: string; sku: string; name: string }[];
  events: CalEvent[];
  bars: CalBar[];
}) {
  const router = useRouter();
  const { y, m, last, startPad } = daysInMonth(month);
  const cells: (number | null)[] = [...Array(startPad).fill(null), ...Array.from({ length: last }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  function eventsOn(day: number) {
    const d = iso(y, m, day);
    return events.filter((e) => e.hireFrom <= d && e.hireTo >= d);
  }

  return (
    <div className="workspace party-workspace" style={{ display: 'grid', gap: 14 }}>
      <div className="party-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
        <Link href={href(shiftMonth(month, -1), productId)}>
          <Button variant="secondary" type="button">
            Prev
          </Button>
        </Link>
        <strong>{monthLabel}</strong>
        <Link href={href(shiftMonth(month, 1), productId)}>
          <Button variant="secondary" type="button">
            Next
          </Button>
        </Link>
        <select
          className="input"
          style={{ maxWidth: 280 }}
          value={productId ?? ''}
          onChange={(e) => router.push(href(month, e.target.value || null))}
        >
          <option value="">All hire products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} — {p.name}
            </option>
          ))}
        </select>
        <Link href="/inventory/levels?fleet=on_rent" style={{ marginLeft: 'auto' }}>
          <Button variant="secondary" type="button">
            On rent now
          </Button>
        </Link>
      </div>

      <Card>
        <div className="card-body" style={{ padding: 12 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 6,
            }}
          >
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', padding: '4px 6px' }}>
                {d}
              </div>
            ))}
            {cells.map((day, i) => {
              const list = day ? eventsOn(day) : [];
              return (
                <div
                  key={i}
                  style={{
                    minHeight: 88,
                    border: '1px solid var(--line, #e5e7eb)',
                    borderRadius: 8,
                    padding: 6,
                    background: day ? 'var(--surface, #fff)' : 'transparent',
                  }}
                >
                  {day ? (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{day}</div>
                      {list.slice(0, 3).map((e) => (
                        <Link
                          key={e.id}
                          href={docHref(e.documentType, e.documentId)}
                          style={{
                            display: 'block',
                            fontSize: 11,
                            marginTop: 4,
                            color: 'inherit',
                            textDecoration: 'none',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={`${e.documentNumber} · ${e.partyName}`}
                        >
                          {e.documentNumber} {e.partyName}
                        </Link>
                      ))}
                      {list.length > 3 ? (
                        <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>+{list.length - 3} more</div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Document</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bars.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ color: 'var(--ink-muted)' }}>
                      No hire reservations in this month.
                    </td>
                  </tr>
                ) : (
                  bars.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.sku}</strong>
                      </td>
                      <td>{b.productName}</td>
                      <td>{b.qty}</td>
                      <td>{b.hireFrom}</td>
                      <td>{b.hireTo}</td>
                      <td>{b.documentNumber}</td>
                      <td>{b.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
