import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCompanySettingsData, saveTaxProfile } from '@/app/actions/company-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { SelectRow, SettingsForm, SettingsSection, TextRow } from '@/components/settings/settings-kit';

export default async function CompanyTaxPage() {
  let tenant;
  let data;
  try {
    [tenant, data] = await Promise.all([getTenantInfo(), getCompanySettingsData()]);
  } catch {
    redirect('/login');
  }

  const tax = data.tax;

  return (
    <BookOneShell active="Tax Info" tenant={tenant}>
      <div className="workspace ux-page set-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Tax info</h1>
              <p>Your tax registration numbers, as the tax office issued them.</p>
            </div>
          </div>
        </header>

        <div className="ux-split">
          <div className="ux-main">
            <SettingsForm id="tax-info" action={saveTaxProfile} title="Tax registration" saveLabel="Save tax info">
              <SettingsSection title="Registration numbers">
                <TextRow name="tin" label="TIN" help="Taxpayer identification number. Printed on invoices and quotations." defaultValue={tax?.tin} />
                <TextRow name="vatNumber" label="VAT number" help="Leave empty if you are not VAT registered." defaultValue={tax?.vatNumber} />
                <TextRow name="svatNumber" label="SVAT number" help="Only if you have one."defaultValue={tax?.svatNumber} />
                <TextRow name="taxOffice" label="Tax office" defaultValue={tax?.taxOffice} />
              </SettingsSection>
              <details className="ux-disclosure set-inner-disclosure">
                <summary>Older numbering fields</summary>
                <p className="set-disclosure-note">
                  Kept for your records. New invoices take their numbers and VAT rate from{' '}
                  <Link href="/company/sales">Sales settings</Link>.
                </p>
                <div className="ux-rows">
                  <TextRow name="defaultTaxRate" label="Default tax rate" inputMode="decimal" defaultValue={tax?.defaultTaxRate ?? '0'} />
                  <SelectRow
                    name="taxBasis"
                    label="Tax basis"
                    defaultValue={tax?.taxBasis ?? 'standard'}
                    options={[
                      { value: 'standard', label: 'Standard' },
                      { value: 'cash', label: 'Cash basis' },
                      { value: 'accrual', label: 'Accrual basis' },
                    ]}
                  />
                  <TextRow name="invoicePrefix" label="Invoice prefix" defaultValue={tax?.invoicePrefix ?? 'INV'} />
                  <TextRow name="billPrefix" label="Bill prefix" defaultValue={tax?.billPrefix ?? 'BILL'} />
                </div>
              </details>
            </SettingsForm>
          </div>

          <aside className="ux-guide set-guide" aria-label="About tax info">
            <h2>Good to know</h2>
            <p>
              Whether you issue tax invoices, and the VAT rate, are set in <Link href="/company/sales">Sales settings</Link>.
            </p>
            <p>The TIN here is the same one shown on Company details.</p>
          </aside>
        </div>
      </div>
    </BookOneShell>
  );
}
