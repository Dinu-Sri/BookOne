import { redirect } from 'next/navigation';
import { getSalesSettings, saveSalesSettingsFromForm } from '@/app/actions/sales-settings';
import {
  archivePosRegisterFromForm,
  listPosRegisters,
  savePosRegisterFromForm,
} from '@/app/actions/pos-registers';
import { getCompanySettingsData } from '@/app/actions/company-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { TextField } from '@/components/ui/text-field';
import {
  ConfirmSubmitButton,
  FormSelect,
  SelectRow,
  SettingsForm,
  SettingsSection,
  SwitchRow,
  TextRow,
} from '@/components/settings/settings-kit';
import { formatDocumentNumber } from '@/lib/document-number';
import { jobCanWrite } from '@/lib/access';

const RESET_OPTIONS = [
  { value: 'monthly', label: 'Each month' },
  { value: 'yearly', label: 'Each year' },
  { value: 'never', label: 'Never (keep counting)' },
];

const PRINT_MODES = [
  { value: 'browser', label: 'Browser print' },
  { value: 'thermal', label: 'Thermal printer only' },
  { value: 'both', label: 'Thermal and browser' },
  { value: 'manual', label: 'Preview only', description: 'No automatic print or cash drawer; print from Last receipt.' },
];

function example(prefix: string, postfix: string, pad: number, reset: string) {
  return formatDocumentNumber({
    prefix,
    postfix,
    pad,
    reset: reset === 'yearly' || reset === 'never' ? reset : 'monthly',
    date: new Date().toISOString().slice(0, 10),
    sequence: 1,
  });
}

export default async function CompanySalesSettingsPage() {
  let tenant;
  let settings;
  let registers;
  let locationOptions: { id: string; name: string; code: string | null }[] = [];
  try {
    [tenant, settings, registers] = await Promise.all([
      getTenantInfo(),
      getSalesSettings(),
      listPosRegisters(),
    ]);
    const company = await getCompanySettingsData().catch(() => null);
    locationOptions = (company?.locations ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      code: l.code,
    }));
  } catch {
    redirect('/login');
  }

  const canWrite = jobCanWrite(tenant, 'Sales Settings');
  const activeCount = registers.filter((r) => r.isActive).length;

  return (
    <BookOneShell active="Sales Settings" tenant={tenant}>
      <div className="workspace ux-page set-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Sales settings</h1>
              <p>Set VAT, how invoices and quotations are numbered, and your shop tills.</p>
            </div>
          </div>
        </header>

        <div className="ux-split">
          <div className="ux-main set-stack">
            <SettingsForm
              id="sales-settings"
              action={canWrite ? saveSalesSettingsFromForm : undefined}
              title="Invoices and VAT"
              saveLabel="Save sales settings"
              readOnly={!canWrite}
              readOnlyNote="Read only: this job cannot change sales settings."
            >
              <SettingsSection title="VAT">
                <SwitchRow
                  name="vatRegistered"
                  label="VAT registered"
                  help="Turns on tax invoices for office invoices and the POS."
                  defaultChecked={settings.vatRegistered}
                />
                <TextRow name="vatRatePercent" label="VAT rate %" help="For local tax invoices." inputMode="decimal" defaultValue={settings.vatRatePercent} />
                <TextRow name="exportVatRatePercent" label="Export VAT rate %" inputMode="decimal" defaultValue={settings.exportVatRatePercent} />
                <TextRow
                  name="taxInvoiceDeptCode"
                  label="Tax invoice department code"
                  help="Tax invoice serials look like 26JUL_01/1, where 01 is this code."
                  defaultValue={settings.taxInvoiceDeptCode}
                />
              </SettingsSection>

              <SettingsSection title="New invoices">
                <SelectRow
                  name="defaultSaleChannel"
                  label="Usual sale channel"
                  help="New documents open as local commercial; change the channel on the document for tax or export."
                  defaultValue={settings.defaultSaleChannel || 'local'}
                  options={[
                    { value: 'local', label: 'Local sales' },
                    { value: 'export', label: 'Export sales' },
                  ]}
                />
                <SelectRow
                  name="defaultInvoiceKind"
                  label="Office invoice type"
                  defaultValue={settings.defaultInvoiceKind || 'commercial'}
                  options={[
                    { value: 'commercial', label: 'Commercial invoice' },
                    { value: 'tax_invoice', label: 'Tax invoice' },
                  ]}
                />
                <SwitchRow
                  name="enforceCreditLimit"
                  label="Enforce customer credit limits"
                  help="Blocks a credit invoice that would take what the customer owes above their limit. Set limits on each customer."
                  defaultChecked={settings.enforceCreditLimit}
                />
                <TextRow
                  name="editLockDays"
                  label="Lock edits after (days)"
                  help="0 lets invoices and quotations be edited any time. Otherwise Edit disappears that many days after the document date."
                  inputMode="numeric"
                  defaultValue={settings.editLockDays ?? 0}
                />
              </SettingsSection>

              <SettingsSection
                title="Invoice numbers"
                help={
                  <>
                    For commercial invoices (tax invoices have their own serial). Next number looks like{' '}
                    <code>{example(settings.invoicePrefix, settings.invoicePostfix, settings.invoicePad, settings.invoiceReset)}</code>
                  </>
                }
              >
                <TextRow name="invoicePrefix" label="Starts with" defaultValue={settings.invoicePrefix} placeholder="INV" />
                <TextRow name="invoicePostfix" label="Ends with" help="Optional, such as /WLK." defaultValue={settings.invoicePostfix} />
                <TextRow name="invoicePad" label="Digits" inputMode="numeric" defaultValue={settings.invoicePad} />
                <SelectRow name="invoiceReset" label="Start again at 1" defaultValue={settings.invoiceReset} options={RESET_OPTIONS} />
              </SettingsSection>

              <SettingsSection
                title="Quotation numbers"
                help={
                  <>
                    Next number looks like{' '}
                    <code>{example(settings.quotePrefix, settings.quotePostfix, settings.quotePad, settings.quoteReset)}</code>
                  </>
                }
              >
                <TextRow name="quotePrefix" label="Starts with" defaultValue={settings.quotePrefix} placeholder="QT" />
                <TextRow name="quotePostfix" label="Ends with" help="Optional." defaultValue={settings.quotePostfix} />
                <TextRow name="quotePad" label="Digits" inputMode="numeric" defaultValue={settings.quotePad} />
                <SelectRow name="quoteReset" label="Start again at 1" defaultValue={settings.quoteReset} options={RESET_OPTIONS} />
              </SettingsSection>
            </SettingsForm>

            <section className="ux-card" id="pos-registers" aria-labelledby="pos-registers-title">
              <header className="ux-card-head">
                <div>
                  <h2 id="pos-registers-title">Shop tills (POS registers)</h2>
                  <p className="set-card-sub">Each counter that takes payments, how it prints, and where its stock comes from.</p>
                </div>
                <span>{activeCount} active</span>
              </header>
              <div className="table-wrap set-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Till</th>
                      <th>Location</th>
                      <th>Printing</th>
                      <th>Cash account</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {registers.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.name}</strong> <span className="muted-line">({r.code})</span>
                          {r.thermalDeviceHint ? <div className="muted-line">{r.thermalDeviceHint}</div> : null}
                        </td>
                        <td>
                          {r.locationId
                            ? locationOptions.find((l) => l.id === r.locationId)?.name ?? 'Linked'
                            : '—'}
                        </td>
                        <td>
                          {canWrite ? (
                            <form action={savePosRegisterFromForm} className="set-inline-form">
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="code" value={r.code} />
                              <input type="hidden" name="name" value={r.name} />
                              <input type="hidden" name="locationId" value={r.locationId ?? ''} />
                              <input type="hidden" name="thermalDeviceHint" value={r.thermalDeviceHint ?? ''} />
                              <input type="hidden" name="receiptFooter" value={r.receiptFooter ?? ''} />
                              <input type="hidden" name="defaultPaymentAccountCode" value={r.defaultPaymentAccountCode} />
                              {r.isActive ? <input type="hidden" name="isActive" value="on" /> : null}
                              <FormSelect
                                id={`print-${r.id}`}
                                name="printMode"
                                label={`Printing for ${r.code}`}
                                defaultValue={r.printMode}
                                options={PRINT_MODES}
                                className="set-label-hidden"
                              />
                              <Button variant="ghost" type="submit">
                                Save
                              </Button>
                            </form>
                          ) : (
                            <span>{PRINT_MODES.find((m) => m.value === r.printMode)?.label ?? r.printMode}</span>
                          )}
                        </td>
                        <td>{r.defaultPaymentAccountCode}</td>
                        <td>
                          <Badge tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Active' : 'Off'}</Badge>
                        </td>
                        <td>
                          {canWrite ? (
                            <form action={archivePosRegisterFromForm}>
                              <input type="hidden" name="id" value={r.id} />
                              <ConfirmSubmitButton
                                title={`Archive the ${r.name} till?`}
                                message="It disappears from the POS and cannot be brought back. Past sales and shifts stay in your books. You must keep at least one active till."
                                confirmLabel="Archive till"
                              >
                                Archive
                              </ConfirmSubmitButton>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {canWrite ? (
                <details className="ux-disclosure set-add">
                  <summary>Add a till</summary>
                  <form action={savePosRegisterFromForm} className="set-add-grid">
                    <TextField id="reg-code" name="code" label="Code" required placeholder="REG-02" />
                    <TextField id="reg-name" name="name" label="Name" required placeholder="Side counter" />
                    <FormSelect id="reg-print" name="printMode" label="Printing" defaultValue="browser" options={PRINT_MODES} />
                    <FormSelect
                      id="reg-location"
                      name="locationId"
                      label="Location (stock and brand)"
                      defaultValue=""
                      options={[
                        { value: '', label: 'No location' },
                        ...locationOptions.map((l) => ({ value: l.id, label: l.code ? `${l.name} (${l.code})` : l.name })),
                      ]}
                    />
                    <TextField id="reg-account" name="defaultPaymentAccountCode" label="Cash account code" defaultValue="1000" />
                    <TextField id="reg-device" name="thermalDeviceHint" label="Printer note" placeholder="e.g. Epson TM-T82 USB" />
                    <TextField id="reg-footer" name="receiptFooter" label="Receipt footer" placeholder="Thank you · Hotline …" className="set-span-2" />
                    <div className="set-add-actions">
                      <label className="set-switch-label" htmlFor="reg-active">
                        <span className="ux-switch">
                          <input id="reg-active" type="checkbox" role="switch" name="isActive" value="on" defaultChecked />
                          <span aria-hidden />
                        </span>
                        Active
                      </label>
                      <Button variant="primary" type="submit">
                        Add register
                      </Button>
                    </div>
                  </form>
                </details>
              ) : null}
            </section>
          </div>

          <aside className="ux-guide set-guide" aria-label="About sales settings">
            <h2>Good to know</h2>
            <p>Number changes apply to the next invoice or quotation. Numbers already issued do not change.</p>
            <p>
              <strong>Preview only</strong> printing skips the automatic print, thermal printing and the cash drawer on sales,
              refunds and day-end. Print from Last receipt or Last Z-report instead.
            </p>
            <p>The thermal printer connects from the POS screen in a supported browser.</p>
          </aside>
        </div>
      </div>
    </BookOneShell>
  );
}
