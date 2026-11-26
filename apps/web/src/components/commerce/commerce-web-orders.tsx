'use client';

import { useMemo, useState } from 'react';
import { retryCommerceReviewFromForm, webOrderActionFromForm } from '@/app/actions/commerce';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { withFormPending } from '@/components/ui/form-busy';
import { SelectField } from '@/components/ui/select-field';
import { SearchField, TextField } from '@/components/ui/text-field';

export type WebOrderView = {
  id: string;
  externalId: string;
  displayNumber: string;
  placedAt: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail?: string | null;
  shippingAddress?: string | null;
  billingAddress?: string | null;
  delivery?: { method?: string; carrier?: string; fee?: string; weightGrams?: number; notes?: string } | null;
  discounts?: Array<{ code?: string; type?: string; amount: string; description?: string }>;
  fees?: Array<{ kind: string; amount: string }>;
  customerNote?: string | null;
  attachments?: Array<{ kind?: string; url: string; fileName?: string }>;
  paymentRef?: string | null;
  gatewayFee?: string | null;
  total: string;
  currency: string;
  paymentMethod: string | null;
  paymentStatus: string;
  status: string;
  reviewReason: string | null;
  fulfilment: {
    status: string;
    confirmedAt?: string | null;
    shipments: Array<{ id: string; carrier: string; trackingNumber: string; trackingUrl: string | null; shippedAt: string; deliveredAt: string | null }>;
  };
  stock: string;
  documentNumber: string | null;
  settlementAccountCode: string | null;
  lines: Array<{ sku: string; description?: string | null; discountAmount?: string; quantity: string; unitPrice: string; restockedQty: string; refundedAmount: string }>;
  createdAt: string;
  updatedAt: string;
};

type Filter = 'all' | 'action' | 'payment' | 'dispatch' | 'dispatched' | 'done' | 'cancelled';

const PAGE = 10;

const STATUS_LABEL: Record<string, string> = {
  received: 'Received',
  needs_review: 'Needs review',
  accepted: 'Accepted',
  posted: 'Invoiced',
  paid: 'Paid',
  fulfilled: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  partially_refunded: 'Part refunded',
  failed: 'Failed',
};

const FULFIL_LABEL: Record<string, string> = {
  unfulfilled: 'Not confirmed',
  confirmed: 'Confirmed',
  picking: 'Picking',
  packed: 'Packed',
  shipped: 'Dispatched',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

const STOCK_LABEL: Record<string, string> = {
  committed: 'Held for this order',
  consumed: 'Deducted on invoice',
  released: 'Released',
  none: 'Not held',
};

function closed(o: WebOrderView) {
  return o.status === 'cancelled' || o.status === 'refunded';
}

function shipped(o: WebOrderView) {
  return ['shipped', 'out_for_delivery', 'delivered', 'returned'].includes(o.fulfilment.status);
}

function matches(o: WebOrderView, filter: Filter): boolean {
  switch (filter) {
    case 'action':
      return o.status === 'needs_review' || (!closed(o) && o.fulfilment.status === 'unfulfilled');
    case 'payment':
      return !closed(o) && o.paymentStatus !== 'paid';
    case 'dispatch':
      return !closed(o) && !shipped(o) && o.status !== 'needs_review';
    case 'dispatched':
      return o.fulfilment.status === 'shipped' || o.fulfilment.status === 'out_for_delivery';
    case 'done':
      return o.fulfilment.status === 'delivered';
    case 'cancelled':
      return closed(o);
    default:
      return true;
  }
}

/** What staff should do next, in words. */
export function nextStepFor(o: WebOrderView): string {
  if (o.status === 'needs_review') return 'Check the reason, then retry';
  if (closed(o)) return '—';
  if (o.fulfilment.status === 'unfulfilled') return 'Confirm the order';
  if (!shipped(o)) return o.paymentStatus === 'paid' ? 'Dispatch' : 'Dispatch (collect payment on delivery)';
  if (o.fulfilment.status !== 'delivered') return 'Mark delivered when it arrives';
  if (o.paymentStatus !== 'paid') return 'Mark paid when the money arrives';
  return '—';
}

function money(v: string, currency: string) {
  const n = Number(v);
  return `${currency} ${Number.isFinite(n) ? n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v}`;
}

function when(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(d);
}

export function CommerceWebOrders({
  connectionId,
  canWrite,
  orders,
  couriers,
  initialOrderId,
}: {
  connectionId: string;
  canWrite: boolean;
  orders: WebOrderView[];
  couriers: Array<{ name: string; trackingUrlTemplate: string | null }>;
  initialOrderId?: string;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState(initialOrderId ?? '');
  const [carrier, setCarrier] = useState(couriers[0]?.name ?? '');
  const [confirm, setConfirm] = useState<null | { op: 'cancel' | 'refund' | 'refund_restock'; order: WebOrderView }>(null);

  const counts = useMemo(
    () => ({
      action: orders.filter((o) => matches(o, 'action')).length,
      payment: orders.filter((o) => matches(o, 'payment')).length,
      dispatch: orders.filter((o) => matches(o, 'dispatch')).length,
    }),
    [orders],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter(
      (o) =>
        matches(o, filter) &&
        (!q ||
          [o.displayNumber, o.externalId, o.customerName, o.customerPhone ?? '', o.documentNumber ?? '']
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
  }, [orders, filter, query]);

  const open = orders.find((o) => o.id === openId) ?? null;

  function runConfirmed() {
    if (!confirm) return;
    const data = new FormData();
    data.set('connectionId', connectionId);
    data.set('orderId', confirm.order.id);
    data.set('op', confirm.op);
    data.set('tab', 'orders');
    setConfirm(null);
    void withFormPending(() => webOrderActionFromForm(data));
  }

  function actionForm(op: string, label: string, variant: 'primary' | 'secondary' = 'secondary') {
    if (!open) return null;
    return (
      <form action={webOrderActionFromForm}>
        <input type="hidden" name="connectionId" value={connectionId} />
        <input type="hidden" name="orderId" value={open.id} />
        <input type="hidden" name="op" value={op} />
        <input type="hidden" name="tab" value="orders" />
        <Button type="submit" variant={variant}>
          {label}
        </Button>
      </form>
    );
  }

  return (
    <div className="commerce-panel-stack">
      <section className="commerce-card">
        <h2 className="commerce-section-title">Web orders</h2>
        <p className="field-help">
          Every order your website sends appears here. Cash on delivery and bank transfer orders hold their stock as soon as
          they arrive, so the same item cannot be sold twice.
        </p>
        <p className="commerce-badges">
          <Badge tone={counts.action ? 'warning' : 'neutral'}>{counts.action} need action</Badge>
          <Badge tone={counts.payment ? 'info' : 'neutral'}>{counts.payment} awaiting payment</Badge>
          <Badge tone={counts.dispatch ? 'info' : 'neutral'}>{counts.dispatch} to dispatch</Badge>
        </p>
        <div className="party-toolbar">
          <SearchField
            id={`web-orders-search-${connectionId}`}
            label="Search orders"
            value={query}
            onChange={(v) => {
              setQuery(v);
              setShown(PAGE);
            }}
            placeholder="Order number, customer, phone or invoice"
          />
          <SelectField
            id={`web-orders-filter-${connectionId}`}
            label="Show"
            value={filter}
            onChange={(v) => {
              setFilter(v as Filter);
              setShown(PAGE);
            }}
            options={[
              { value: 'all', label: `All orders (${orders.length})` },
              { value: 'action', label: 'Need action' },
              { value: 'payment', label: 'Awaiting payment' },
              { value: 'dispatch', label: 'To dispatch' },
              { value: 'dispatched', label: 'Dispatched' },
              { value: 'done', label: 'Delivered' },
              { value: 'cancelled', label: 'Cancelled or refunded' },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <p className="field-help">
            {orders.length === 0
              ? 'No orders yet. Orders appear here as soon as your website sends them.'
              : 'No orders match this view.'}
          </p>
        ) : (
          <div className="commerce-table-scroll" tabIndex={0} role="region" aria-label="Web orders">
            <table className="commerce-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Placed</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, shown).map((o) => (
                  <tr key={o.id} className={o.id === openId ? 'is-selected' : undefined}>
                    <td>
                      <button type="button" className="link-button" onClick={() => setOpenId(o.id === openId ? '' : o.id)}>
                        {o.displayNumber}
                      </button>
                    </td>
                    <td>{when(o.placedAt)}</td>
                    <td>{o.customerName || '—'}</td>
                    <td>{money(o.total, o.currency)}</td>
                    <td>
                      {(o.paymentMethod ?? 'unknown').toUpperCase()} ·{' '}
                      <Badge tone={o.paymentStatus === 'paid' ? 'success' : o.paymentStatus === 'failed' ? 'danger' : 'warning'}>
                        {o.paymentStatus === 'paid' ? 'Paid' : o.paymentStatus === 'failed' ? 'Failed' : 'Pending'}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={o.status === 'needs_review' ? 'warning' : closed(o) ? 'neutral' : 'info'}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </Badge>{' '}
                      {FULFIL_LABEL[o.fulfilment.status] ?? o.fulfilment.status}
                    </td>
                    <td>{nextStepFor(o)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > shown ? (
          <Button type="button" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({filtered.length - shown} left)
          </Button>
        ) : null}
      </section>

      {open ? (
        <section className="commerce-card" aria-labelledby={`order-detail-${open.id}`}>
          <h2 className="commerce-section-title" id={`order-detail-${open.id}`}>
            Order {open.displayNumber}
          </h2>
          {open.reviewReason ? (
            <p className={open.status === 'needs_review' ? 'form-error' : 'field-help'} role="status">
              {open.reviewReason}
            </p>
          ) : null}
          <dl className="commerce-sync-facts">
            <div>
              <dt>Customer</dt>
              <dd>
                {open.customerName || '—'}
                {open.customerPhone ? ` · ${open.customerPhone}` : ''}
                {open.customerEmail ? ` · ${open.customerEmail}` : ''}
              </dd>
            </div>
            {open.shippingAddress ? (
              <div>
                <dt>Ship to</dt>
                <dd>{open.shippingAddress}</dd>
              </div>
            ) : null}
            {open.billingAddress && open.billingAddress !== open.shippingAddress ? (
              <div>
                <dt>Bill to</dt>
                <dd>{open.billingAddress}</dd>
              </div>
            ) : null}
            {open.delivery ? (
              <div>
                <dt>Delivery</dt>
                <dd>
                  {[open.delivery.method, open.delivery.carrier].filter(Boolean).join(' · ') || '—'}
                  {open.delivery.fee ? ` · fee ${money(open.delivery.fee, open.currency)}` : ''}
                  {open.delivery.weightGrams ? ` · ${open.delivery.weightGrams} g` : ''}
                  {open.delivery.notes ? ` · ${open.delivery.notes}` : ''}
                </dd>
              </div>
            ) : null}
            {open.discounts?.length ? (
              <div>
                <dt>Discounts</dt>
                <dd>{open.discounts.map((d) => `${d.code ?? d.type ?? 'Discount'} ${money(d.amount, open.currency)}`).join(' · ')}</dd>
              </div>
            ) : null}
            {open.fees?.some((f) => Number(f.amount)) ? (
              <div>
                <dt>Fees</dt>
                <dd>{open.fees.filter((f) => Number(f.amount)).map((f) => `${f.kind} ${money(f.amount, open.currency)}`).join(' · ')}</dd>
              </div>
            ) : null}
            {open.customerNote ? (
              <div>
                <dt>Customer note</dt>
                <dd>{open.customerNote}</dd>
              </div>
            ) : null}
            {open.attachments?.length ? (
              <div>
                <dt>Attachments</dt>
                <dd>
                  {open.attachments.map((a, i) => (
                    <a key={`${a.url}-${i}`} href={a.url} target="_blank" rel="noopener noreferrer" style={{ marginRight: 8 }}>
                      {a.fileName || a.kind || `File ${i + 1}`}
                    </a>
                  ))}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Payment</dt>
              <dd>
                {(open.paymentMethod ?? 'unknown').toUpperCase()} · {open.paymentStatus === 'paid' ? 'Paid' : open.paymentStatus}
                {open.paymentRef ? ` · ref ${open.paymentRef}` : ''}
                {open.gatewayFee ? ` · gateway fee ${money(open.gatewayFee, open.currency)}` : ''}
                {open.settlementAccountCode ? ` · settled to ${open.settlementAccountCode}` : ''}
              </dd>
            </div>
            <div>
              <dt>Stock</dt>
              <dd>{STOCK_LABEL[open.stock] ?? open.stock}</dd>
            </div>
            <div>
              <dt>Invoice</dt>
              <dd>{open.documentNumber ?? 'Not invoiced yet'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {STATUS_LABEL[open.status] ?? open.status} · {FULFIL_LABEL[open.fulfilment.status] ?? open.fulfilment.status}
              </dd>
            </div>
            <div>
              <dt>Placed</dt>
              <dd>{when(open.placedAt)}</dd>
            </div>
          </dl>

          <div className="commerce-table-scroll" tabIndex={0} role="region" aria-label="Order lines">
            <table className="commerce-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Line total</th>
                </tr>
              </thead>
              <tbody>
                {open.lines.map((line, i) => (
                  <tr key={`${line.sku}-${i}`}>
                    <td>
                      {line.sku}
                      {line.description ? <span className="field-help"> · {line.description}</span> : null}
                    </td>
                    <td>{Number(line.quantity)}</td>
                    <td>{money(line.unitPrice, open.currency)}</td>
                    <td>{money(String(Number(line.quantity) * Number(line.unitPrice)), open.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Order total (incl. shipping, tax and discounts)</td>
                  <td>{money(open.total, open.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {open.fulfilment.shipments.length ? (
            <ul className="commerce-key-list">
              {open.fulfilment.shipments.map((s) => (
                <li key={s.id}>
                  {s.carrier} · {s.trackingUrl ? <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer">{s.trackingNumber}</a> : s.trackingNumber}
                  {' · dispatched '}
                  {when(s.shippedAt)}
                  {s.deliveredAt ? ` · delivered ${when(s.deliveredAt)}` : ''}
                </li>
              ))}
            </ul>
          ) : null}

          {canWrite ? (
            <div className="commerce-panel-stack">
              <div className="commerce-inline-actions">
                {open.status === 'needs_review' ? (
                  <form action={retryCommerceReviewFromForm}>
                    <input type="hidden" name="connectionId" value={connectionId} />
                    <input type="hidden" name="orderId" value={open.id} />
                    <input type="hidden" name="tab" value="orders" />
                    <Button type="submit" variant="primary">
                      Retry posting
                    </Button>
                  </form>
                ) : null}
                {!closed(open) && open.fulfilment.status === 'unfulfilled' ? actionForm('confirm', 'Confirm order', 'primary') : null}
                {!closed(open) && open.paymentStatus !== 'paid' ? actionForm('paid', 'Mark paid') : null}
                {open.fulfilment.status === 'shipped' || open.fulfilment.status === 'out_for_delivery'
                  ? actionForm('delivered', 'Mark delivered', 'primary')
                  : null}
                {['shipped', 'out_for_delivery', 'delivered'].includes(open.fulfilment.status) ? actionForm('returned', 'Mark returned') : null}
                <a
                  className="button secondary"
                  href={`/company/commerce/packing-slip?connection=${encodeURIComponent(connectionId)}&order=${encodeURIComponent(open.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Packing slip
                </a>
                {!closed(open) ? (
                  <Button type="button" variant="ghost" onClick={() => setConfirm({ op: 'cancel', order: open })}>
                    Cancel order
                  </Button>
                ) : null}
                {open.documentNumber && open.status !== 'refunded' ? (
                  <>
                    <Button type="button" variant="ghost" onClick={() => setConfirm({ op: 'refund', order: open })}>
                      Refund
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirm({ op: 'refund_restock', order: open })}>
                      Refund and restock
                    </Button>
                  </>
                ) : null}
              </div>

              {!closed(open) && !shipped(open) && open.status !== 'needs_review' ? (
                <form action={webOrderActionFromForm} className="form-grid">
                  <input type="hidden" name="connectionId" value={connectionId} />
                  <input type="hidden" name="orderId" value={open.id} />
                  <input type="hidden" name="op" value="dispatch" />
                  <input type="hidden" name="tab" value="orders" />
                  {couriers.length ? (
                    <SelectField
                      id={`dispatch-carrier-${open.id}`}
                      name="carrier"
                      label="Courier"
                      value={carrier}
                      onChange={setCarrier}
                      options={couriers.map((c) => ({ value: c.name, label: c.name }))}
                      help="Add couriers and tracking links under Settings."
                    />
                  ) : (
                    <TextField
                      id={`dispatch-carrier-${open.id}`}
                      name="carrier"
                      label="Courier"
                      placeholder="Courier name"
                      help="Save couriers under Settings to pick them here."
                      required
                    />
                  )}
                  <TextField
                    id={`dispatch-tracking-${open.id}`}
                    name="trackingNumber"
                    label="Tracking number"
                    required
                  />
                  <div style={{ alignSelf: 'start', paddingTop: 22 }}>
                    <Button type="submit">Dispatch</Button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : (
            <p className="field-help">You can view this order. Ask an Owner or Manager to change it.</p>
          )}
        </section>
      ) : orders.length ? (
        <p className="field-help">Select an order number to see its lines and actions.</p>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.op === 'cancel'
            ? `Cancel order ${confirm.order.displayNumber}?`
            : `Refund order ${confirm?.order.displayNumber ?? ''}?`
        }
        message={
          confirm?.op === 'cancel'
            ? confirm.order.documentNumber
              ? 'BookOne posts a sales return against the invoice and puts the items back into stock. The website is told the order was cancelled.'
              : 'Held stock is released and the order is closed. Nothing was invoiced, so no return is needed.'
            : confirm?.op === 'refund_restock'
              ? 'BookOne posts a sales return for the remaining amount and puts the items back into stock.'
              : 'BookOne posts a money-only return for the remaining amount. Stock does not change.'
        }
        confirmLabel={confirm?.op === 'cancel' ? 'Cancel order' : 'Refund'}
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirmed}
      />
    </div>
  );
}
