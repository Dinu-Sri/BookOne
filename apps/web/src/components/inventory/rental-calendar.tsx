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
  documentId: string;
  documentNumber: string;
  documentType: string;
  partyName: string;
  status: string;
};

type CalView = 'timeline' | 'month' | 'list';

const PASTELS = [
  { bg: '#dbeafe', border: '#93c5fd', text: '#1e3a8a' },
  { bg: '#d1fae5', border: '#6ee7b7', text: '#065f46' },
  { bg: '#fce7f3', border: '#f9a8d4', text: '#9d174d' },
  { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
  { bg: '#e0e7ff', border: '#a5b4fc', text: '#3730a3' },
  { bg: '#ccfbf1', border: '#5eead4', text: '#115e59' },
  { bg: '#ede9fe', border: '#c4b5fd', text: '#5b21b6' },
  { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' },
  { bg: '#f1f5f9', border: '#cbd5e1', text: '#334155' },
  { bg: '#fae8ff', border: '#e879f9', text: '#86198f' },
] as const;

const OVERDUE = { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' };

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

function href(month: string, productId: string | null, view: CalView) {
  const q = new URLSearchParams({ month, view });
  if (productId) q.set('productId', productId);
  return `/inventory/calendar?${q}`;
}

function docHref(type: string, id: string) {
  if (type === 'quotation') return `/sales/quotations/${id}`;
  if (type === 'sales_order') return `/sales/orders/${id}`;
  return `/sales/invoices/${id}`;
}

function hashHue(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) >>> 0;
  return PASTELS[h % PASTELS.length]!;
}

function barColor(bar: { documentId: string; hireTo: string; status: string }, today: string) {
  if (bar.status === 'dispatched' && bar.hireTo < today) return OVERDUE;
  return hashHue(bar.documentId);
}

function dayNum(ymd: string) {
  return Number(ymd.slice(8, 10));
}

function clampDay(ymd: string, y: number, m: number, last: number) {
  const ym = `${y}-${String(m).padStart(2, '0')}`;
  if (ymd.slice(0, 7) < ym) return 1;
  if (ymd.slice(0, 7) > ym) return last;
  return Math.min(last, Math.max(1, dayNum(ymd)));
}

function assignLanes(items: { id: string; hireFrom: string; hireTo: string }[]) {
  const sorted = [...items].sort(
    (a, b) => a.hireFrom.localeCompare(b.hireFrom) || a.hireTo.localeCompare(b.hireTo) || a.id.localeCompare(b.id),
  );
  const laneEnds: string[] = [];
  const laneOf = new Map<string, number>();
  for (const it of sorted) {
    let lane = laneEnds.findIndex((end) => end < it.hireFrom);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.hireTo);
    } else {
      laneEnds[lane] = it.hireTo;
    }
    laneOf.set(it.id, lane);
  }
  return { laneOf, laneCount: Math.max(1, laneEnds.length) };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function RentalCalendar({
  month,
  productId,
  view = 'timeline',
  products,
  events,
  bars,
}: {
  month: string;
  productId: string | null;
  view?: CalView;
  products: { id: string; sku: string; name: string }[];
  events: CalEvent[];
  bars: CalBar[];
}) {
  const router = useRouter();
  const { y, m, last, startPad } = daysInMonth(month);
  const today = todayIso();
  const cells: (number | null)[] = [...Array(startPad).fill(null), ...Array.from({ length: last }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  const visibleEvents = productId
    ? events.filter((e) => bars.some((b) => b.documentId === e.documentId))
    : events;

  const productRows = (() => {
    const map = new Map<string, { productId: string; sku: string; productName: string; bars: CalBar[] }>();
    for (const b of bars) {
      const row = map.get(b.productId) ?? {
        productId: b.productId,
        sku: b.sku,
        productName: b.productName,
        bars: [],
      };
      row.bars.push(b);
      map.set(b.productId, row);
    }
    if (productId && !map.has(productId)) {
      const p = products.find((x) => x.id === productId);
      if (p) map.set(p.id, { productId: p.id, sku: p.sku, productName: p.name, bars: [] });
    }
    return [...map.values()].sort((a, b) => a.productName.localeCompare(b.productName));
  })();

  function eventsOn(day: number) {
    const d = iso(y, m, day);
    return visibleEvents.filter((e) => e.hireFrom <= d && e.hireTo >= d);
  }

  return (
    <div className="workspace party-workspace hire-cal" style={{ display: 'grid', gap: 14 }}>
      <div className="party-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
        <Link href={href(shiftMonth(month, -1), productId, view)}>
          <Button variant="secondary" type="button">
            Prev
          </Button>
        </Link>
        <strong>{monthLabel}</strong>
        <Link href={href(shiftMonth(month, 1), productId, view)}>
          <Button variant="secondary" type="button">
            Next
          </Button>
        </Link>
        <select
          className="input"
          style={{ maxWidth: 280 }}
          value={productId ?? ''}
          onChange={(e) => router.push(href(month, e.target.value || null, view))}
        >
          <option value="">All hire products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} — {p.name}
            </option>
          ))}
        </select>
        <div className="hire-cal-views">
          {(['timeline', 'month', 'list'] as CalView[]).map((v) => (
            <Link key={v} href={href(month, productId, v)}>
              <Button variant={view === v ? 'primary' : 'secondary'} type="button">
                {v === 'timeline' ? 'Timeline' : v === 'month' ? 'Month' : 'List'}
              </Button>
            </Link>
          ))}
        </div>
        <Link href="/inventory/levels?fleet=on_rent" style={{ marginLeft: 'auto' }}>
          <Button variant="secondary" type="button">
            On rent now
          </Button>
        </Link>
      </div>

      <div className="hire-cal-legend">
        <span>Each job has its own pastel. Overlapping hires stack. Today is highlighted.</span>
        <span className="hire-cal-chip hire-cal-chip-reserved">Reserved</span>
        <span className="hire-cal-chip hire-cal-chip-out">Dispatched</span>
        <span className="hire-cal-chip hire-cal-chip-late">Overdue</span>
      </div>

      {view === 'timeline' ? (
        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            {productRows.length === 0 ? (
              <p className="hire-cal-empty">No hire reservations in this month.</p>
            ) : (
              <div className="hire-cal-scroll">
                <div
                  className="hire-cal-timeline"
                  style={{ ['--hire-days' as string]: last, minWidth: 200 + last * 36 }}
                >
                  <div className="hire-cal-head">
                    <div className="hire-cal-item-col">Item</div>
                    <div className="hire-cal-days">
                      {Array.from({ length: last }, (_, i) => {
                        const d = iso(y, m, i + 1);
                        const weekend = new Date(`${d}T12:00:00`).getDay() % 6 === 0;
                        return (
                          <div
                            key={d}
                            className={`hire-cal-dayhead${d === today ? ' is-today' : ''}${weekend ? ' is-weekend' : ''}`}
                          >
                            <span>{i + 1}</span>
                            <small>
                              {new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' })}
                            </small>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {productRows.map((row) => {
                    const { laneOf, laneCount } = assignLanes(row.bars);
                    return (
                      <div
                        key={row.productId}
                        className="hire-cal-row"
                        style={{ minHeight: 44 + laneCount * 26 }}
                      >
                        <div className="hire-cal-item-col">
                          <strong>{row.productName}</strong>
                          <small>{row.sku}</small>
                        </div>
                        <div className="hire-cal-track-wrap">
                          <div
                            className="hire-cal-track"
                            style={{ gridTemplateColumns: `repeat(${last}, minmax(36px, 1fr))` }}
                          >
                            {Array.from({ length: last }, (_, i) => {
                              const d = iso(y, m, i + 1);
                              const weekend = new Date(`${d}T12:00:00`).getDay() % 6 === 0;
                              return (
                                <div
                                  key={d}
                                  className={`hire-cal-cell${d === today ? ' is-today' : ''}${weekend ? ' is-weekend' : ''}`}
                                />
                              );
                            })}
                          </div>
                          <div className="hire-cal-bars">
                            {row.bars.map((bar) => {
                              const start = clampDay(bar.hireFrom, y, m, last);
                              const end = clampDay(bar.hireTo, y, m, last);
                              if (end < start) return null;
                              const lane = laneOf.get(bar.id) ?? 0;
                              const color = barColor(bar, today);
                              const continuesLeft = bar.hireFrom.slice(0, 7) < month;
                              const continuesRight = bar.hireTo.slice(0, 7) > month;
                              const span = end - start + 1;
                              return (
                                <Link
                                  key={bar.id}
                                  href={docHref(bar.documentType, bar.documentId)}
                                  className={`hire-cal-bar${bar.status === 'dispatched' ? ' is-out' : ''}${continuesLeft ? ' is-cont-left' : ''}${continuesRight ? ' is-cont-right' : ''}`}
                                  style={{
                                    left: `calc(${((start - 1) / last) * 100}% + 3px)`,
                                    width: `calc(${(span / last) * 100}% - 6px)`,
                                    top: 6 + lane * 26,
                                    background: color.bg,
                                    borderColor: color.border,
                                    color: color.text,
                                  }}
                                  title={`${bar.documentNumber} · ${bar.partyName} · qty ${bar.qty} · ${bar.hireFrom} → ${bar.hireTo} · ${bar.status}`}
                                >
                                  <span>
                                    {bar.qty} · {bar.partyName}
                                  </span>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {view === 'month' ? (
        <Card>
          <div className="card-body" style={{ padding: 12 }}>
            <div className="hire-cal-month">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="hire-cal-month-dow">
                  {d}
                </div>
              ))}
              {cells.map((day, i) => {
                const list = day ? eventsOn(day) : [];
                const d = day ? iso(y, m, day) : '';
                return (
                  <div
                    key={i}
                    className={`hire-cal-month-cell${day ? '' : ' is-pad'}${d === today ? ' is-today' : ''}`}
                  >
                    {day ? (
                      <>
                        <div className="hire-cal-month-num">{day}</div>
                        <div className="hire-cal-month-stack">
                          {list.slice(0, 4).map((e) => {
                            const color = e.status === 'dispatched' && e.hireTo < today ? OVERDUE : hashHue(e.documentId);
                            return (
                              <Link
                                key={e.id}
                                href={docHref(e.documentType, e.documentId)}
                                className="hire-cal-month-chip"
                                style={{ background: color.bg, borderColor: color.border, color: color.text }}
                                title={`${e.documentNumber} · ${e.partyName}${e.venue ? ` · ${e.venue}` : ''}`}
                              >
                                {e.partyName}
                              </Link>
                            );
                          })}
                          {list.length > 4 ? (
                            <div className="hire-cal-more">+{list.length - 4} more</div>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      ) : null}

      {view === 'list' ? (
        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th />
                    <th>SKU</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Customer</th>
                    <th>Document</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bars.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ color: 'var(--ink-muted)' }}>
                        No hire reservations in this month.
                      </td>
                    </tr>
                  ) : (
                    bars.map((b) => {
                      const color = barColor(b, today);
                      return (
                        <tr key={b.id}>
                          <td>
                            <span
                              className="hire-cal-swatch"
                              style={{ background: color.bg, borderColor: color.border }}
                            />
                          </td>
                          <td>
                            <strong>{b.sku}</strong>
                          </td>
                          <td>{b.productName}</td>
                          <td>{b.qty}</td>
                          <td>{b.hireFrom}</td>
                          <td>{b.hireTo}</td>
                          <td>{b.partyName}</td>
                          <td>
                            <Link href={docHref(b.documentType, b.documentId)}>{b.documentNumber}</Link>
                          </td>
                          <td>{b.status}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      ) : null}

      {view !== 'list' && visibleEvents.length > 0 ? (
        <div className="hire-cal-jobs">
          {visibleEvents.map((e) => {
            const color = hashHue(e.documentId);
            return (
              <Link
                key={e.id}
                href={docHref(e.documentType, e.documentId)}
                className="hire-cal-job"
                style={{ borderColor: color.border, background: color.bg }}
              >
                <strong style={{ color: color.text }}>{e.documentNumber}</strong>
                <span>{e.partyName}</span>
                <small>
                  {e.hireFrom} → {e.hireTo}
                  {e.venue ? ` · ${e.venue}` : ''}
                </small>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
