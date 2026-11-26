import { EMPTY_FULFILMENT } from './fulfilment';
import type { OrderInput, OrderRow } from './types';

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/**
 * WP5: fold the optional `fees`, `delivery.fee` and `discounts` into the v1
 * `shippingAmount` and `discountAmount` when those are not sent, so totals,
 * validation and posting work unchanged. Explicit v1 fields always win.
 */
export function normalizeOrderInput(input: OrderInput): OrderInput {
  const out: OrderInput = { ...input };
  if ((out.shippingAmount === undefined || out.shippingAmount === '') && (out.fees?.length || out.delivery?.fee)) {
    const fees = out.fees?.length
      ? out.fees.reduce((s, f) => s + (Number(f.amount) || 0), 0)
      : Number(out.delivery?.fee ?? 0) || 0;
    out.shippingAmount = money(fees);
  }
  if ((out.discountAmount === undefined || out.discountAmount === '') && out.discounts?.length) {
    out.discountAmount = money(out.discounts.reduce((s, d) => s + (Number(d.amount) || 0), 0));
  }
  return out;
}

/** One line of an address for notes and screens. */
export function addressText(a: OrderInput['shippingAddress']): string {
  if (!a) return '';
  return [a.name, a.line1, a.line2, a.city, a.district, a.province, a.postalCode, a.country, a.phone]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

/** Text printed on the invoice for a web order (ship-to, delivery, coupons, note). */
export function invoiceNotes(input: OrderInput): string {
  const parts = [`Web order ${input.displayNumber || input.externalId}`];
  const ship = addressText(input.shippingAddress);
  if (ship) parts.push(`Ship to: ${ship}`);
  if (input.delivery?.method || input.delivery?.carrier) {
    parts.push(`Delivery: ${[input.delivery.method, input.delivery.carrier].filter(Boolean).join(' / ')}`);
  }
  for (const d of input.discounts ?? []) parts.push(`Discount ${d.code ?? d.type ?? ''} ${d.amount}`.replace(/\s+/g, ' ').trim());
  for (const f of input.fees ?? []) if (Number(f.amount)) parts.push(`Fee ${f.kind} ${f.amount}`);
  if (input.customerNote) parts.push(`Customer note: ${input.customerNote}`);
  return parts.join('\n').slice(0, 2000);
}

const SHIPPED = new Set(['shipped', 'out_for_delivery', 'delivered']);

/** WP5: the full order as the website sees it (GET /orders and GET /orders/{externalId}). */
export function orderView(order: OrderRow, invoiceUrl?: string | null) {
  const s = order.snapshot;
  const fulfilment = order.fulfilment ?? EMPTY_FULFILMENT;
  const shipped = SHIPPED.has(fulfilment.status);
  const lineIds = order.lines.map((l) => ({ externalLineId: l.externalLineId, quantity: l.quantity }));
  return {
    externalId: order.externalId,
    displayNumber: s.displayNumber ?? order.externalId,
    status: order.status,
    reviewReason: order.reviewReason,
    placedAt: order.placedAt,
    currency: order.currency,
    total: order.total,
    customer: s.customer,
    channelCustomerId: s.channelCustomerId ?? null,
    shippingAddress: s.shippingAddress ?? null,
    billingAddress: s.billingAddress ?? null,
    delivery: s.delivery ?? null,
    discounts: s.discounts ?? [],
    fees: s.fees ?? [],
    customerNote: s.customerNote ?? null,
    lines: order.lines.map((l) => ({
      externalLineId: l.externalLineId,
      sku: l.sku,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountAmount: l.discountAmount,
      taxAmount: l.taxAmount,
      fulfilledQuantity: shipped ? l.quantity : '0',
      restockedQuantity: l.restockedQty,
      refundedAmount: l.refundedAmount,
    })),
    payment: {
      method: s.payment?.method ?? null,
      status: s.payment?.status ?? null,
      amount: s.payment?.amount ?? null,
      externalRef: s.payment?.externalRef ?? null,
      gatewayFee: s.payment?.gatewayFee ?? null,
    },
    invoice: order.documentId
      ? { documentId: order.documentId, documentNumber: order.documentNumber, url: invoiceUrl ?? null }
      : null,
    stock: fulfilment.stock ?? 'none',
    fulfilment: {
      status: fulfilment.status,
      confirmedAt: fulfilment.confirmedAt ?? null,
      shipments: fulfilment.shipments.map((sh) => ({ ...sh, lines: sh.lines ?? lineIds })),
    },
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
