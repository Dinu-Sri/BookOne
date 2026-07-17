import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSalesSettings, saveSalesSettingsFromForm } from '@/app/actions/sales-settings';
import {
  archivePosRegisterFromForm,
  listPosRegisters,
  savePosRegisterFromForm,
} from '@/app/actions/pos-registers';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Button } from '@/components/ui/bookone-ui';

export default async function CompanySalesSettingsPage() {
  let tenant;
  let settings;
  let registers;
  try {
    [tenant, settings, registers] = await Promise.all([
      getTenantInfo(),
      getSalesSettings(),
      listPosRegisters(),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Sales Settings" tenant={tenant}>
      <div className="workspace party-workspace" style={{ display: 'grid', gap: 14 }}>
        {/* VAT / invoice defaults */}
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
              VAT &amp; invoice defaults
            </span>
          </div>
          <form action={saveSalesSettingsFromForm} className="party-form-body">
            <div className="party-tab-panel">
              <div className="party-tab-grid">
                <div className="field">
                  <label>VAT rate % (local tax invoices)</label>
                  <input
                    className="input"
                    name="vatRatePercent"
                    inputMode="decimal"
                    defaultValue={settings.vatRatePercent}
                  />
                </div>
                <div className="field">
                  <label>Export VAT rate %</label>
                  <input
                    className="input"
                    name="exportVatRatePercent"
                    inputMode="decimal"
                    defaultValue={settings.exportVatRatePercent}
                  />
                </div>
                <div className="field field-full">
                  <label className="party-check">
                    <input type="checkbox" name="vatRegistered" value="on" defaultChecked={settings.vatRegistered} />
                    Company is VAT registered (enables TAX INVOICE on invoices / POS)
                  </label>
                </div>
                <div className="field">
                  <label>Tax invoice dept / division code</label>
                  <input className="input" name="taxInvoiceDeptCode" defaultValue={settings.taxInvoiceDeptCode} />
                  <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                    Format <code>YYMMM_DEPT/SERIAL</code> e.g. 26JUL_01/1
                  </p>
                </div>
                <div className="field">
                  <label>Default sale channel</label>
                  <select className="input" name="defaultSaleChannel" defaultValue={settings.defaultSaleChannel}>
                    <option value="local">Local sales</option>
                    <option value="export">Export sales</option>
                  </select>
                </div>
                <div className="field">
                  <label>Default invoice kind (office invoices)</label>
                  <select className="input" name="defaultInvoiceKind" defaultValue={settings.defaultInvoiceKind}>
                    <option value="commercial">Commercial invoice</option>
                    <option value="tax_invoice">Tax invoice</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="party-form-footer">
              <Button variant="primary" type="submit">
                Save VAT settings
              </Button>
            </div>
          </form>
        </div>

        {/* POS registers */}
        <div className="party-form-shell" id="pos-registers" style={{ maxHeight: 'none', minHeight: 0 }}>
          <div className="party-form-top">
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>POS registers (counters)</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>
              Multi-counter · print mode per register · commercial default at POS
            </span>
          </div>

          <div className="doc-form-scroll" style={{ paddingBottom: 8 }}>
            <div className="table-wrap" style={{ border: '1px solid var(--line)', borderRadius: 8, marginBottom: 14 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Print</th>
                    <th>Cash account</th>
                    <th>Active</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {registers.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.code}</strong>
                      </td>
                      <td>{r.name}</td>
                      <td>
                        {r.printMode === 'both'
                          ? 'Browser + thermal'
                          : r.printMode === 'thermal'
                            ? 'Thermal'
                            : 'Browser'}
                        {r.thermalDeviceHint ? (
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{r.thermalDeviceHint}</div>
                        ) : null}
                      </td>
                      <td>{r.defaultPaymentAccountCode}</td>
                      <td>{r.isActive ? 'Yes' : 'No'}</td>
                      <td>
                        <div className="party-row-actions">
                          <form action={archivePosRegisterFromForm}>
                            <input type="hidden" name="id" value={r.id} />
                            <Button variant="ghost" type="submit">
                              Archive
                            </Button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form action={savePosRegisterFromForm}>
              <div className="doc-form-header">
                <div className="field">
                  <label>Code *</label>
                  <input className="input" name="code" required placeholder="REG-02" />
                </div>
                <div className="field field-span-2">
                  <label>Name *</label>
                  <input className="input" name="name" required placeholder="Side counter" />
                </div>
                <div className="field">
                  <label>Print mode *</label>
                  <select className="input" name="printMode" defaultValue="browser">
                    <option value="browser">Browser print</option>
                    <option value="thermal">Thermal only</option>
                    <option value="both">Both (thermal + browser)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Thermal device note</label>
                  <input className="input" name="thermalDeviceHint" placeholder="e.g. Epson TM-T82 USB" />
                </div>
                <div className="field">
                  <label>Default cash account code</label>
                  <input className="input" name="defaultPaymentAccountCode" defaultValue="1000" />
                </div>
                <div className="field field-span-2">
                  <label>Receipt footer</label>
                  <input className="input" name="receiptFooter" placeholder="Thank you · Hotline …" />
                </div>
                <div className="field field-span-2">
                  <label className="party-check">
                    <input type="checkbox" name="isActive" value="on" defaultChecked />
                    Active
                  </label>
                </div>
              </div>
              <div className="doc-form-footer" style={{ border: 0, padding: '8px 0 0', background: 'transparent' }}>
                <Button variant="primary" type="submit">
                  Add register
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </BookOneShell>
  );
}
