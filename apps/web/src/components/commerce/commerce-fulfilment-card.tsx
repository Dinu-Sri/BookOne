'use client';

import { useState } from 'react';
import { saveCommerceFulfilmentSettingsFromForm } from '@/app/actions/commerce';
import { Button } from '@/components/ui/bookone-ui';
import { TextField } from '@/components/ui/text-field';

const DEFAULT_HOLD = ['cod', 'bank_transfer'];

/** Which unpaid orders hold stock, and the couriers offered when dispatching. */
export function CommerceFulfilmentCard({
  connectionId,
  canWrite,
  seenMethods,
  holdMethods,
  couriers,
}: {
  connectionId: string;
  canWrite: boolean;
  seenMethods: string[];
  holdMethods: string[] | undefined;
  couriers: Array<{ name: string; trackingUrlTemplate: string | null }>;
}) {
  const hold = holdMethods ?? DEFAULT_HOLD;
  const methods = [...new Set([...DEFAULT_HOLD, ...seenMethods, ...hold])].sort();
  const [rows, setRows] = useState(couriers.length ? couriers : [{ name: '', trackingUrlTemplate: null }]);

  return (
    <form action={saveCommerceFulfilmentSettingsFromForm} className="commerce-card">
      <h2 className="commerce-section-title">Orders and delivery</h2>
      <input type="hidden" name="connectionId" value={connectionId} />
      <input type="hidden" name="tab" value="settings" />

      <fieldset className="commerce-scope-list" disabled={!canWrite}>
        <legend className="commerce-section-title">Hold stock while payment is pending</legend>
        <p className="field-help">
          Orders paid with these methods reserve their items as soon as they arrive, so the website and the POS cannot sell
          the same item again. The hold is released if the order is cancelled and becomes a normal stock deduction when
          the order is invoiced. Card payments are confirmed straight away and do not need a hold.
        </p>
        {methods.map((m) => (
          <label className="party-check" key={m}>
            <input type="checkbox" name="holdStock" value={m} defaultChecked={hold.includes(m)} /> <code>{m}</code>
          </label>
        ))}
        <TextField
          id={`hold-extra-${connectionId}`}
          name="holdStockExtra"
          label="Other method names"
          placeholder="Comma separated, e.g. pay_at_store"
          help="Spelled exactly as your website names the payment method, e.g. cod."
        />
      </fieldset>

      <fieldset className="commerce-fields" disabled={!canWrite}>
        <legend className="commerce-section-title">Couriers for dispatch</legend>
        <p className="field-help">
          Offered when you dispatch a web order. Add a tracking link with <code>{'{tracking}'}</code> where the tracking
          number goes, so customers get a clickable link.
        </p>
        {rows.map((row, i) => (
          <div className="form-grid" key={i}>
            <TextField
              id={`courier-name-${connectionId}-${i}`}
              name="courierName"
              label="Courier"
              defaultValue={row.name}
              placeholder="Courier name"
            />
            <TextField
              id={`courier-template-${connectionId}-${i}`}
              name="courierTemplate"
              label="Tracking link (optional)"
              defaultValue={row.trackingUrlTemplate ?? ''}
              placeholder="https://…/track?no={tracking}"
            />
          </div>
        ))}
        {canWrite ? (
          <Button type="button" variant="ghost" onClick={() => setRows((r) => [...r, { name: '', trackingUrlTemplate: null }])}>
            Add courier
          </Button>
        ) : null}
      </fieldset>

      {canWrite ? <Button type="submit">Save orders and delivery</Button> : null}
    </form>
  );
}
