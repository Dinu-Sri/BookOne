import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { getTenantInfo } from '@/app/actions/workspace';
import { createCompany, getCompanySettingsData, saveCompanyProfile, switchActiveCompany } from '@/app/actions/company-settings';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { TextField } from '@/components/ui/text-field';
import { SettingsForm, SettingsSection, TextRow } from '@/components/settings/settings-kit';

export default async function CompanyDetailsPage() {
  let tenant;
  let data;
  try {
    [tenant, data] = await Promise.all([getTenantInfo(), getCompanySettingsData()]);
  } catch {
    redirect('/login');
  }

  const profile = data.profile;
  const tax = data.tax;

  return (
    <BookOneShell active="Company Details" tenant={tenant}>
      <div className="workspace ux-page set-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Company details</h1>
              <p>Your company&apos;s name, contact details and address, as printed on invoices, quotations and reports.</p>
            </div>
          </div>
        </header>

        <div className="ux-split">
          <div className="ux-main">
            <SettingsForm
              id="company-details"
              action={saveCompanyProfile}
              title={profile?.legalName || tenant.name}
              saveLabel="Save company details"
            >
              <SettingsSection title="Name and registration">
                <TextRow name="legalName" label="Legal name" help="As registered. Printed on documents." defaultValue={profile?.legalName ?? tenant.name} />
                <TextRow name="tradingName" label="Trading name" help="The name customers know, if different." defaultValue={profile?.tradingName} />
                <TextRow name="registrationNumber" label="Registration number" defaultValue={profile?.registrationNumber} />
                <TextRow name="tin" label="TIN" help="Taxpayer number, printed on invoices and quotations." defaultValue={tax?.tin} />
              </SettingsSection>
              <SettingsSection title="Contact">
                <TextRow name="phone" label="Phone" defaultValue={profile?.phone} />
                <TextRow name="email" label="Email" type="email" defaultValue={profile?.email} />
                <TextRow name="website" label="Website" defaultValue={profile?.website} placeholder="https://example.com" />
              </SettingsSection>
              <SettingsSection title="Address">
                <TextRow name="addressLine1" label="Address line 1" defaultValue={profile?.addressLine1} />
                <TextRow name="addressLine2" label="Address line 2" defaultValue={profile?.addressLine2} />
                <TextRow name="city" label="City" defaultValue={profile?.city} />
                <TextRow name="postalCode" label="Postal code" defaultValue={profile?.postalCode} />
              </SettingsSection>
              <SettingsSection title="Country and currency">
                <TextRow name="country" label="Country" defaultValue={profile?.country ?? 'Sri Lanka'} />
                <TextRow name="baseCurrency" label="Currency" help="The currency your books are kept in." defaultValue={profile?.baseCurrency ?? 'LKR'} />
                <TextRow name="timezone" label="Time zone" help="Used for dates and times across BookOne." defaultValue={profile?.timezone ?? 'Asia/Colombo'} />
              </SettingsSection>
            </SettingsForm>
          </div>

          <aside className="set-stack">
            <section className="ux-card" aria-labelledby="companies-title">
              <header className="ux-card-head">
                <h2 id="companies-title">Your companies</h2>
                <span>{data.companies.length}</span>
              </header>
              <div className="ux-rows">
                {data.companies.map((company) => (
                  <div className="ux-row" key={company.id}>
                    <div className="ux-row-text">
                      <strong>{company.name}</strong>
                      <span>{company.role}</span>
                    </div>
                    {company.active ? (
                      <Badge tone="success">Open now</Badge>
                    ) : (
                      <form action={switchActiveCompany}>
                        <input type="hidden" name="tenantId" value={company.id} />
                        <Button variant="secondary" type="submit">
                          Switch
                        </Button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
              <details className="ux-disclosure set-add">
                <summary>Add a company</summary>
                <form action={createCompany} className="set-add-grid is-single">
                  <TextField id="new-company-name" name="name" label="Company name" placeholder="Clossyan Retail Pvt Ltd" />
                  <TextField id="new-company-slug" name="slug" label="Short name" help="Lowercase letters and dashes, such as clossyan-retail." placeholder="clossyan-retail" />
                  <TextField id="new-company-country" name="country" label="Country" defaultValue="Sri Lanka" />
                  <TextField id="new-company-currency" name="baseCurrency" label="Currency" defaultValue="LKR" />
                  <div className="set-add-actions is-end">
                    <Button variant="primary" type="submit">
                      <Plus size={16} /> Add company
                    </Button>
                  </div>
                </form>
              </details>
            </section>
          </aside>
        </div>
      </div>
    </BookOneShell>
  );
}
