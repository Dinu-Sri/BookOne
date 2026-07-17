import Link from 'next/link';
import {
  createDiscountFromForm,
  updateDiscountFromForm,
  type DiscountRow,
} from '@/app/actions/discounts';
import { Button } from '@/components/ui/bookone-ui';

export function DiscountForm({
  mode,
  discount,
}: {
  mode: 'create' | 'edit';
  discount?: DiscountRow | null;
}) {
  const action = mode === 'edit' ? updateDiscountFromForm : createDiscountFromForm;

  return (
    <form action={action} className="doc-form-shell">
      {mode === 'edit' && discount ? <input type="hidden" name="id" value={discount.id} /> : null}

      <div className="party-form-top">
        <Link href="/sales/discounts" className="party-back-btn">
          <span className="party-back-arrow" aria-hidden>
            ←
          </span>
          <span>
            <strong>Back to list</strong>
            <small>Discounts</small>
          </span>
        </Link>
      </div>

      <div className="doc-form-scroll">
        <div className="doc-form-header">
          <div className="field field-span-2">
            <label>Name *</label>
            <input
              className="input"
              name="name"
              required
              defaultValue={discount?.name ?? ''}
              placeholder="Holiday 10%"
            />
          </div>
          <div className="field">
            <label>Code</label>
            <input
              className="input"
              name="code"
              defaultValue={discount?.code ?? ''}
              placeholder="HOL10"
            />
          </div>
          <div className="field">
            <label>Type</label>
            <select className="input" name="discountType" defaultValue={discount?.discountType ?? 'percent'}>
              <option value="percent">Percent (%)</option>
              <option value="fixed">Fixed amount (LKR)</option>
            </select>
          </div>
          <div className="field">
            <label>Value *</label>
            <input
              className="input"
              name="value"
              required
              inputMode="decimal"
              defaultValue={discount ? String(discount.value) : ''}
              placeholder="10"
            />
          </div>
          <div className="field">
            <label>Starts on</label>
            <input className="input" name="startsOn" type="date" defaultValue={discount?.startsOn ?? ''} />
          </div>
          <div className="field">
            <label>Ends on</label>
            <input className="input" name="endsOn" type="date" defaultValue={discount?.endsOn ?? ''} />
          </div>
          <div className="field field-span-2">
            <label className="party-check" style={{ marginTop: 18 }}>
              <input
                type="checkbox"
                name="isActive"
                value="on"
                defaultChecked={discount ? discount.isActive === '1' : true}
              />
              Active (available on quotes, orders, invoices, POS)
            </label>
          </div>
          <div className="field field-span-2">
            <label>Notes</label>
            <input className="input" name="notes" defaultValue={discount?.notes ?? ''} placeholder="Optional" />
          </div>
        </div>
      </div>

      <div className="doc-form-footer">
        <Link href="/sales/discounts">
          <Button variant="secondary" type="button">
            Cancel
          </Button>
        </Link>
        <Button variant="primary" type="submit">
          {mode === 'edit' ? 'Save changes' : 'Save discount'}
        </Button>
      </div>
    </form>
  );
}
