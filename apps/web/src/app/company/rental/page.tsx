import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getRentalSettings, saveRentalSettingsFromForm } from '@/app/actions/rental-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Button } from '@/components/ui/bookone-ui';

export default async function CompanyRentalSettingsPage() {
  let tenant;
  let settings;
  try {
    [tenant, settings] = await Promise.all([getTenantInfo(), getRentalSettings()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Rental Settings" tenant={tenant}>
      <div className="workspace party-workspace" style={{ display: 'grid', gap: 14 }}>
        <form action={saveRentalSettingsFromForm} style={{ display: 'grid', gap: 14 }}>
          <div className="party-form-shell" style={{ maxHeight: 'none', minHeight: 0 }}>
            <div className="party-form-top">
              <Link href="/company/details" className="party-back-btn">
                <span className="party-back-arrow">←</span>
                <span>
                  <strong>Back</strong>
                  <small>Company</small>
                </span>
              </Link>
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
                Hire rate units
              </span>
            </div>
            <div className="party-form-body">
              <div className="party-tab-panel">
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 10px' }}>
                  Enable every unit this company actually uses. A product still picks one unit from
                  this list (chairs per event, a generator per day, a speaker per hour).
                </p>
                <div className="party-tab-grid">
                  <div className="field field-full">
                    <label className="party-check">
                      <input
                        type="checkbox"
                        name="allowHirePerEvent"
                        value="on"
                        defaultChecked={settings.allowHirePerEvent}
                      />
                      Per event (one rate for the whole booking)
                    </label>
                  </div>
                  <div className="field field-full">
                    <label className="party-check">
                      <input
                        type="checkbox"
                        name="allowHirePerDay"
                        value="on"
                        defaultChecked={settings.allowHirePerDay}
                      />
                      Per day (rate × hire days)
                    </label>
                  </div>
                  <div className="field field-full">
                    <label className="party-check">
                      <input
                        type="checkbox"
                        name="allowHirePerHour"
                        value="on"
                        defaultChecked={settings.allowHirePerHour}
                      />
                      Per hour
                    </label>
                  </div>
                  <div className="field">
                    <label>Default unit for new hire products</label>
                    <select className="input" name="defaultHireUnit" defaultValue={settings.defaultHireUnit}>
                      <option value="event">Event</option>
                      <option value="day">Day</option>
                      <option value="hour">Hour</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="party-form-shell" style={{ maxHeight: 'none', minHeight: 0 }}>
            <div className="party-form-top">
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
                When to invoice
              </span>
            </div>
            <div className="party-form-body">
              <div className="party-tab-panel">
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 10px' }}>
                  Catering often invoices when the job is booked. Tool hire often invoices at
                  dispatch or after return. Enable every timing this company uses; a booking can
                  pick among them if override is on.
                </p>
                <div className="party-tab-grid">
                  <div className="field field-full">
                    <label className="party-check">
                      <input
                        type="checkbox"
                        name="allowInvoiceOnConfirm"
                        value="on"
                        defaultChecked={settings.allowInvoiceOnConfirm}
                      />
                      When the booking is confirmed
                    </label>
                  </div>
                  <div className="field field-full">
                    <label className="party-check">
                      <input
                        type="checkbox"
                        name="allowInvoiceOnDispatch"
                        value="on"
                        defaultChecked={settings.allowInvoiceOnDispatch}
                      />
                      When kit is dispatched
                    </label>
                  </div>
                  <div className="field field-full">
                    <label className="party-check">
                      <input
                        type="checkbox"
                        name="allowInvoiceAfterReturn"
                        value="on"
                        defaultChecked={settings.allowInvoiceAfterReturn}
                      />
                      After return / inspection
                    </label>
                  </div>
                  <div className="field field-full">
                    <label className="party-check">
                      <input
                        type="checkbox"
                        name="allowInvoiceManual"
                        value="on"
                        defaultChecked={settings.allowInvoiceManual}
                      />
                      Manual only (staff create the invoice)
                    </label>
                  </div>
                  <div className="field">
                    <label>Default timing</label>
                    <select
                      className="input"
                      name="defaultInvoiceTiming"
                      defaultValue={settings.defaultInvoiceTiming}
                    >
                      <option value="on_confirm">On confirm</option>
                      <option value="on_dispatch">On dispatch</option>
                      <option value="after_return">After return</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>
                  <div className="field field-full">
                    <label className="party-check">
                      <input
                        type="checkbox"
                        name="allowInvoiceTimingOverride"
                        value="on"
                        defaultChecked={settings.allowInvoiceTimingOverride}
                      />
                      Allow a different timing on each booking
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="party-form-shell" style={{ maxHeight: 'none', minHeight: 0 }}>
            <div className="party-form-top">
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
                Deposits
              </span>
            </div>
            <div className="party-form-body">
              <div className="party-tab-panel">
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 10px' }}>
                  Deposits are a liability (account 2400), not sales. Hire income posts to 4400. Event hire often takes one
                  amount per job; high-value kit often takes a deposit per item. Both can be on.
                </p>
                <div className="party-tab-grid">
                  <div className="field field-full">
                    <label className="party-check">
                      <input
                        type="checkbox"
                        name="allowDepositPerEvent"
                        value="on"
                        defaultChecked={settings.allowDepositPerEvent}
                      />
                      Per event (one deposit on the booking)
                    </label>
                  </div>
                  <div className="field field-full">
                    <label className="party-check">
                      <input
                        type="checkbox"
                        name="allowDepositPerItem"
                        value="on"
                        defaultChecked={settings.allowDepositPerItem}
                      />
                      Per item (amount on the hire product)
                    </label>
                  </div>
                  <div className="field">
                    <label>Default on new bookings</label>
                    <select
                      className="input"
                      name="defaultDepositMode"
                      defaultValue={settings.defaultDepositMode}
                    >
                      <option value="none">No deposit</option>
                      <option value="per_event">Per event</option>
                      <option value="per_item">Per item</option>
                      <option value="both">Event + item</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Default event deposit amount</label>
                    <input
                      className="input"
                      name="defaultEventDepositAmount"
                      inputMode="decimal"
                      defaultValue={settings.defaultEventDepositAmount}
                    />
                  </div>
                  <div className="field">
                    <label>Default event deposit %</label>
                    <input
                      className="input"
                      name="defaultEventDepositPercent"
                      inputMode="decimal"
                      defaultValue={settings.defaultEventDepositPercent}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="party-form-shell" style={{ maxHeight: 'none', minHeight: 0 }}>
            <div className="party-form-top">
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
                Overlap &amp; turnaround
              </span>
            </div>
            <div className="party-form-body">
              <div className="party-tab-panel">
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 10px' }}>
                  When two bookings want the same chairs on the same dates. Manager override is the
                  usual catering default: staff cannot double-book; a manager can force it with a
                  reason (VIP, sub-rent).
                </p>
                <div className="party-tab-grid">
                  <div className="field field-full">
                    <label>If qty is already reserved</label>
                    <select className="input" name="overlapPolicy" defaultValue={settings.overlapPolicy}>
                      <option value="block">Block — nobody can confirm an overlap</option>
                      <option value="override">
                        Manager override — staff blocked; manager/admin may confirm with a reason
                      </option>
                      <option value="warn">Warn — anyone can confirm after a warning</option>
                      <option value="allow">Allow — no availability check</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Late fee per overdue day</label>
                    <input
                      className="input"
                      name="defaultLateFeePerDay"
                      inputMode="decimal"
                      defaultValue={settings.defaultLateFeePerDay}
                    />
                    <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                      Suggested on return when kit comes back after hire-to. 0 hides the suggestion.
                    </p>
                  </div>
                  <div className="field">
                    <label>Default turnaround hours</label>
                    <input
                      className="input"
                      name="defaultTurnaroundHours"
                      inputMode="numeric"
                      defaultValue={String(settings.defaultTurnaroundHours)}
                    />
                    <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                      Hours after a return before the qty can be booked again (wash / transit). 0
                      means next booking may start at the collect time. Products may override.
                    </p>
                  </div>
                </div>
              </div>
              <div className="party-form-footer">
                <Button variant="primary" type="submit">
                  Save rental settings
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </BookOneShell>
  );
}
