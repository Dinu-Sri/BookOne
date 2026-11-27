import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { PrintSheetButton } from '@/components/print/print-sheet-button';
import { operatorFromSession, withCommerceService } from '@/lib/commerce-runtime';

/** WP5: printable packing slip for a web order (ship-to, delivery, lines, customer note). */
export default async function PackingSlipPage({
  searchParams,
}: {
  searchParams: Promise<{ connection?: string; order?: string }>;
}) {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login?from=/company/commerce');
  }
  if ((tenant.accessByLabel?.['Commerce Integrations'] ?? 'none') === 'none') redirect(tenant.landingHref ?? '/?denied=1');
  const q = await searchParams;
  const operator = await operatorFromSession();
  const order = await withCommerceService(operator.tenantId, (service) =>
    service.getWebOrder(operator, q.connection ?? '', q.order ?? ''),
  ).catch(() => null);
  if (!order) redirect('/company/commerce?tab=orders');

  const cell: React.CSSProperties = { borderBottom: '1px solid #ddd', padding: '6px 8px', textAlign: 'left', verticalAlign: 'top' };
  return (
    <main style={{ maxWidth: 760, margin: '24px auto', padding: 24, fontFamily: 'system-ui, sans-serif', color: '#111', background: '#fff' }}>
      <style>{'@media print { .no-print { display: none !important; } body { background: #fff; } }'}</style>
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <PrintSheetButton label="Print packing slip" />
      </div>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Packing slip</h1>
          <p style={{ margin: '4px 0 0' }}>{tenant.name}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <strong>Order {order.displayNumber}</strong>
          <p style={{ margin: '4px 0 0' }}>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Colombo' }).format(new Date(order.placedAt))}</p>
          {order.documentNumber ? <p style={{ margin: '4px 0 0' }}>Invoice {order.documentNumber}</p> : null}
        </div>
      </header>
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 14, margin: '0 0 4px' }}>Ship to</h2>
          <p style={{ margin: 0, whiteSpace: 'pre-line' }}>
            {order.shippingAddress || order.customerName}
            {order.customerPhone ? `\n${order.customerPhone}` : ''}
          </p>
        </div>
        <div>
          <h2 style={{ fontSize: 14, margin: '0 0 4px' }}>Delivery</h2>
          <p style={{ margin: 0 }}>
            {[order.delivery?.method, order.delivery?.carrier].filter(Boolean).join(' · ') || '—'}
            {order.fulfilment.shipments.length
              ? ` · ${order.fulfilment.shipments.map((s) => `${s.carrier} ${s.trackingNumber}`).join(', ')}`
              : ''}
          </p>
          {order.delivery?.notes ? <p style={{ margin: '4px 0 0' }}>{order.delivery.notes}</p> : null}
          <p style={{ margin: '4px 0 0' }}>Payment: {(order.paymentMethod ?? '—').toUpperCase()} · {order.paymentStatus}</p>
        </div>
      </section>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={cell}>SKU</th>
            <th style={cell}>Item</th>
            <th style={{ ...cell, textAlign: 'right' }}>Qty</th>
            <th style={{ ...cell, width: 60 }}>Packed</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l, i) => (
            <tr key={`${l.sku}-${i}`}>
              <td style={cell}>{l.sku}</td>
              <td style={cell}>{l.description ?? ''}</td>
              <td style={{ ...cell, textAlign: 'right' }}>{Number(l.quantity)}</td>
              <td style={cell}>☐</td>
            </tr>
          ))}
        </tbody>
      </table>
      {order.customerNote ? (
        <p>
          <strong>Customer note:</strong> {order.customerNote}
        </p>
      ) : null}
    </main>
  );
}
