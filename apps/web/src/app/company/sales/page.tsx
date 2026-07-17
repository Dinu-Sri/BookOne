import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSalesSettings, saveSalesSettingsFromForm } from '@/app/actions/sales-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Button, Card } from '@/components/ui/bookone-ui';

export default async function CompanySalesSettingsPage() {
  let tenant;
  let settings;
  try {
    [tenant, settings] = await Promise.all([getTenantInfo(), getSalesSettings()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Sales Settings" tenant={tenant}>
      <div className="workspace party-workspace">
        <div className="party-form-shell">
          <div className="party-form-top">
            <Link href="/company/details" className="party-back-btn">
              <span className="party-back-arrow">←</span>
              <span>
                <strong>Back</strong>
                <small>Company</small>
              </span>
            </Link>
          </div>
          <form action={saveSalesSettingsFromForm} className="party-form-body">
            <div className="party-tab-grid">
              <div className="field field-full">
                <h2 style={{ margin: 0, fontSize: 18 }}>Sales &amp; VAT settings</h2>
                <p style={{ margin: '6px 0 0', color: 'var(--ink-muted)', fontSize: 13 }}>
                  Controls tax invoice numbering, default VAT rate (IRD standard 18%), and local/export defaults.
                </p>
              </div>
              <div className="field">
                <label>VAT rate % (local tax invoices)</label>
                <input className="input" name="vatRatePercent" inputMode="decimal" defaultValue={settings.vatRatePercent} />
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
                  Company is VAT registered (enables TAX INVOICE)
                </label>
              </div>
              <div className="field">
                <label>Tax invoice dept / division code</label>
                <input className="input" name="taxInvoiceDeptCode" defaultValue={settings.taxInvoiceDeptCode} />
                <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                  Used in number format <code>YYMMM_DEPT/SERIAL</code> e.g. 26JUL_01/1
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
                <label>Default invoice kind</label>
                <select className="input" name="defaultInvoiceKind" defaultValue={settings.defaultInvoiceKind}>
                  <option value="commercial">Commercial invoice</option>
                  <option value="tax_invoice">Tax invoice</option>
                </select>
              </div>
            </div>
            <div className="party-form-footer">
              <Button variant="primary" type="submit">
                Save sales settings
              </Button>
            </div>
          </form>
        </div>
      </div>
    </BookOneShell>
  );
}
