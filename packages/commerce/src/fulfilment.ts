import type { Fulfilment, FulfilmentStatus, Shipment } from './types';

export const EMPTY_FULFILMENT: Fulfilment = { status: 'unfulfilled', confirmedAt: null, shipments: [], stock: 'none' };

const STATUSES: FulfilmentStatus[] = [
  'unfulfilled',
  'confirmed',
  'picking',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'returned',
  'cancelled',
];

export function normalizeFulfilment(raw: unknown): Fulfilment {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_FULFILMENT, shipments: [] };
  const obj = raw as Record<string, unknown>;
  const status = STATUSES.includes(obj.status as FulfilmentStatus) ? (obj.status as FulfilmentStatus) : 'unfulfilled';
  const shipments = Array.isArray(obj.shipments)
    ? (obj.shipments as Array<Record<string, unknown>>).map(
        (s): Shipment => ({
          id: String(s.id ?? ''),
          carrier: String(s.carrier ?? ''),
          trackingNumber: String(s.trackingNumber ?? ''),
          trackingUrl: s.trackingUrl ? String(s.trackingUrl) : null,
          shippedAt: String(s.shippedAt ?? ''),
          deliveredAt: s.deliveredAt ? String(s.deliveredAt) : null,
        }),
      )
    : [];
  const stock = ['none', 'committed', 'released', 'consumed'].includes(String(obj.stock))
    ? (obj.stock as Fulfilment['stock'])
    : 'none';
  return {
    status,
    confirmedAt: obj.confirmedAt ? String(obj.confirmedAt) : null,
    shipments,
    stock,
  };
}

/** Tracking URL from a courier template such as "https://track.example/{tracking}". */
export function trackingUrlFor(template: string | null | undefined, trackingNumber: string): string | null {
  if (!template || !trackingNumber) return null;
  return template.includes('{tracking}') ? template.replaceAll('{tracking}', encodeURIComponent(trackingNumber)) : null;
}
