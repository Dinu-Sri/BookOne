import { redirect } from 'next/navigation';
import { listHireBayPresence, type HireBayPresence } from '@/app/actions/company-settings';
import { getRentalSettings, saveRentalSettingsFromForm } from '@/app/actions/rental-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { SelectRow, SettingsForm, SettingsSection, SwitchRow, TextRow } from '@/components/settings/settings-kit';
import { HireBaySetupForm } from '../rental-bay-form';

export default async function CompanyRentalSettingsPage() {
  let tenant;
  let settings;
  let hireBays: HireBayPresence[] = [];
  try {
    [tenant, settings, hireBays] = await Promise.all([
      getTenantInfo(),
      getRentalSettings(),
      listHireBayPresence(),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Rental Settings" tenant={tenant}>
      <div className="workspace ux-page set-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Rental settings</h1>
              <p>Set how you charge for hire, when you invoice, deposits and double bookings.</p>
            </div>
          </div>
        </header>

        <div className="ux-split">
          <div className="ux-main set-stack">
            <SettingsForm
              id="rental-settings"
              action={saveRentalSettingsFromForm}
              title="Hire rules"
              saveLabel="Save rental settings"
            >
              <SettingsSection
                title="Rate units"
                help="Turn on every unit you use. Each hire product still picks one of them."
              >
                <SwitchRow name="allowHirePerEvent" label="Per event" help="One rate for the whole booking, such as chairs for a wedding." defaultChecked={settings.allowHirePerEvent} />
                <SwitchRow name="allowHirePerDay" label="Per day" help="Rate × hire days, such as a generator." defaultChecked={settings.allowHirePerDay} />
                <SwitchRow name="allowHirePerHour" label="Per hour" help="Rate × hours, such as a speaker." defaultChecked={settings.allowHirePerHour} />
                <SelectRow
                  name="defaultHireUnit"
                  label="Unit for new hire products"
                  defaultValue={settings.defaultHireUnit}
                  options={[
                    { value: 'event', label: 'Event' },
                    { value: 'day', label: 'Day' },
                    { value: 'hour', label: 'Hour' },
                  ]}
                />
              </SettingsSection>

              <SettingsSection
                title="When to invoice"
                help="Catering often invoices when the job is booked; tool hire at dispatch or after return. Turn on every timing you use."
              >
                <SwitchRow name="allowInvoiceOnConfirm" label="When the booking is confirmed" defaultChecked={settings.allowInvoiceOnConfirm} />
                <SwitchRow name="allowInvoiceOnDispatch" label="When kit is dispatched" defaultChecked={settings.allowInvoiceOnDispatch} />
                <SwitchRow name="allowInvoiceAfterReturn" label="After return and inspection" defaultChecked={settings.allowInvoiceAfterReturn} />
                <SwitchRow name="allowInvoiceManual" label="Manual only" help="Staff create the invoice themselves." defaultChecked={settings.allowInvoiceManual} />
                <SelectRow
                  name="defaultInvoiceTiming"
                  label="Usual timing"
                  help="What a new booking starts with."
                  defaultValue={settings.defaultInvoiceTiming}
                  options={[
                    { value: 'on_confirm', label: 'On confirm' },
                    { value: 'on_dispatch', label: 'On dispatch' },
                    { value: 'after_return', label: 'After return' },
                    { value: 'manual', label: 'Manual' },
                  ]}
                />
                <SwitchRow
                  name="allowInvoiceTimingOverride"
                  label="Let each booking choose its timing"
                  defaultChecked={settings.allowInvoiceTimingOverride}
                />
              </SettingsSection>

              <SettingsSection
                title="Deposits"
                help="Deposits are money you owe back (account 2400), not sales. Hire income posts to 4400. Both kinds can be on."
              >
                <SwitchRow name="allowDepositPerEvent" label="Per event" help="One deposit on the booking." defaultChecked={settings.allowDepositPerEvent} />
                <SwitchRow name="allowDepositPerItem" label="Per item" help="An amount set on the hire product." defaultChecked={settings.allowDepositPerItem} />
                <SelectRow
                  name="defaultDepositMode"
                  label="Deposit on new bookings"
                  defaultValue={settings.defaultDepositMode}
                  options={[
                    { value: 'none', label: 'No deposit' },
                    { value: 'per_event', label: 'Per event' },
                    { value: 'per_item', label: 'Per item' },
                    { value: 'both', label: 'Event and item' },
                  ]}
                />
                <TextRow name="defaultEventDepositAmount" label="Event deposit amount" inputMode="decimal" defaultValue={settings.defaultEventDepositAmount} />
                <TextRow name="defaultEventDepositPercent" label="Event deposit %" inputMode="decimal" defaultValue={settings.defaultEventDepositPercent} />
              </SettingsSection>

              <SettingsSection title="Double bookings and returns">
                <SelectRow
                  name="overlapPolicy"
                  label="If the quantity is already booked"
                  help="Manager override suits most caterers: staff cannot double-book; a manager can, with a reason."
                  defaultValue={settings.overlapPolicy}
                  wide
                  options={[
                    { value: 'block', label: 'Block', description: 'Nobody can confirm an overlap.' },
                    { value: 'override', label: 'Manager override', description: 'Staff are blocked; a manager or admin may confirm with a reason.' },
                    { value: 'warn', label: 'Warn', description: 'Anyone can confirm after a warning.' },
                    { value: 'allow', label: 'Allow', description: 'No availability check.' },
                  ]}
                />
                <TextRow
                  name="defaultLateFeePerDay"
                  label="Late fee per day"
                  help="Suggested when kit comes back late. 0 hides the suggestion."
                  inputMode="decimal"
                  defaultValue={settings.defaultLateFeePerDay}
                />
                <TextRow
                  name="defaultTurnaroundHours"
                  label="Turnaround hours"
                  help="Hours after a return before the kit can be booked again (cleaning, transport). Products may set their own."
                  inputMode="numeric"
                  defaultValue={String(settings.defaultTurnaroundHours)}
                />
              </SettingsSection>
            </SettingsForm>

            <section className="ux-card" aria-labelledby="hire-bays-title">
              <header className="ux-card-head">
                <h2 id="hire-bays-title">Hire bays</h2>
              </header>
              <div className="ux-card-body">
                <HireBaySetupForm bays={hireBays} />
              </div>
            </section>
          </div>

          <aside className="ux-guide set-guide" aria-label="About rental settings">
            <h2>Good to know</h2>
            <p>A booking can only use the rate units, invoice timings and deposit kinds you turn on here.</p>
            <p>Hire bays are the On rent, Wash and Repair stock locations that dispatch and returns move kit through. Create them once.</p>
          </aside>
        </div>
      </div>
    </BookOneShell>
  );
}
