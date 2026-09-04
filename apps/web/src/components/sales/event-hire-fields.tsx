'use client';

import { todayString } from '@/components/module/list-page';
import { INVOICE_TIMING_LABELS, INVOICE_TIMINGS, type InvoiceTiming } from '@/lib/rental-core';

export function documentHasRentalLines(
  lines: { productId?: string; saveAsType?: string }[],
  products: { id: string; productType?: string }[],
): boolean {
  return lines.some((line) => {
    if (line.saveAsType === 'rental') return true;
    if (!line.productId) return false;
    const product = products.find((p) => p.id === line.productId);
    return product?.productType === 'rental';
  });
}

export function EventHireFields({
  defaults,
  visible = true,
}: {
  defaults?: {
    eventDate?: string | null;
    hireFrom?: string | null;
    hireTo?: string | null;
    venue?: string | null;
    guestCount?: number | null;
    invoiceTiming?: InvoiceTiming | null;
  };
  visible?: boolean;
}) {
  const today = todayString();
  if (!visible) return null;
  return (
    <>
      <div className="field">
        <label>Event date</label>
        <input className="input" type="date" name="eventDate" defaultValue={defaults?.eventDate ?? today} />
      </div>
      <div className="field">
        <label>Hire from</label>
        <input className="input" type="date" name="hireFrom" defaultValue={defaults?.hireFrom ?? today} />
      </div>
      <div className="field">
        <label>Hire to</label>
        <input className="input" type="date" name="hireTo" defaultValue={defaults?.hireTo ?? today} />
      </div>
      <div className="field">
        <label>Venue</label>
        <input className="input" name="venue" defaultValue={defaults?.venue ?? ''} placeholder="Event location" />
      </div>
      <div className="field">
        <label>Guest count</label>
        <input
          className="input"
          name="guestCount"
          inputMode="numeric"
          defaultValue={defaults?.guestCount != null ? String(defaults.guestCount) : ''}
        />
      </div>
      <div className="field field-full">
        <label className="party-check">
          <input type="checkbox" name="confirmOverlap" value="on" />
          Confirm overlap (warn / manager override)
        </label>
      </div>
      <div className="field field-full">
        <label>Overlap override reason</label>
        <input className="input" name="overlapOverrideReason" placeholder="Required when a manager forces an overlap" />
      </div>
      <div className="field">
        <label>Invoice timing</label>
        <select
          className="input"
          name="invoiceTiming"
          defaultValue={defaults?.invoiceTiming ?? 'on_confirm'}
        >
          {INVOICE_TIMINGS.map((timing) => (
            <option key={timing} value={timing}>
              {INVOICE_TIMING_LABELS[timing]}
            </option>
          ))}
        </select>
      </div>
      <div className="field field-full">
        <label className="party-check">
          <input type="checkbox" name="confirmTimingOverride" value="on" />
          Invoice before this stage (timing override)
        </label>
      </div>
    </>
  );
}
