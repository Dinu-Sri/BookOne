import { redirect } from 'next/navigation';
import { Building2, Plus } from 'lucide-react';
import { getTenantInfo } from '@/app/actions/workspace';
import { createCompany, getCompanySettingsData, saveCompanyProfile, switchActiveCompany } from '@/app/actions/company-settings';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { CompanyCard, Field, SaveButton } from '../_components';

export default async function CompanyDetailsPage() {
  let tenant;
  let data;
  try {
    [tenant, data] = await Promise.all([getTenantInfo(), getCompanySettingsData()]);
  } catch {
    redirect('/login');
  }

  const profile = data.profile;

  return (
    <BookOneShell active="Company Details" tenant={tenant}>
      <div className="workspace">
        <div className="grid two" style={{ alignItems: 'start' }}>
          <CompanyCard title="Company details" subtitle="Legal identity used across reports, invoices, and company records." action={<Building2 size={18} color="var(--brand)" />}>
            <form action={saveCompanyProfile} className="form-grid">
              <Field label="Legal name" name="legalName" defaultValue={profile?.legalName ?? tenant.name} wide />
              <Field label="Trading name" name="tradingName" defaultValue={profile?.tradingName} />
              <Field label="Registration no." name="registrationNumber" defaultValue={profile?.registrationNumber} />
              <Field label="Country" name="country" defaultValue={profile?.country ?? 'Sri Lanka'} />
              <Field label="Currency" name="baseCurrency" defaultValue={profile?.baseCurrency ?? 'LKR'} />
              <Field label="Timezone" name="timezone" defaultValue={profile?.timezone ?? 'Asia/Colombo'} />
              <Field label="Phone" name="phone" defaultValue={profile?.phone} />
              <Field label="Email" name="email" type="email" defaultValue={profile?.email} />
              <Field label="Address line 1" name="addressLine1" defaultValue={profile?.addressLine1} wide />
              <Field label="Address line 2" name="addressLine2" defaultValue={profile?.addressLine2} wide />
              <Field label="City" name="city" defaultValue={profile?.city} />
              <Field label="Postal code" name="postalCode" defaultValue={profile?.postalCode} />
              <SaveButton>Save company details</SaveButton>
            </form>
          </CompanyCard>

          <CompanyCard title="Companies" subtitle="Create and switch legal companies connected to this login.">
            <div className="balance-list">
              {data.companies.map((company) => (
                <div className="balance-row" key={company.id}>
                  <div>
                    <strong>{company.name}</strong>
                    <span>{company.slug} - {company.role}</span>
                  </div>
                  {company.active ? (
                    <Badge tone="success">Active</Badge>
                  ) : (
                    <form action={switchActiveCompany}>
                      <input type="hidden" name="tenantId" value={company.id} />
                      <Button variant="secondary" type="submit">Switch</Button>
                    </form>
                  )}
                </div>
              ))}
            </div>
            <form action={createCompany} className="form-grid" style={{ marginTop: 16 }}>
              <Field label="New company" name="name" placeholder="Clossyan Retail Pvt Ltd" />
              <Field label="Slug" name="slug" placeholder="clossyan-retail" />
              <Field label="Country" name="country" defaultValue="Sri Lanka" />
              <Field label="Currency" name="baseCurrency" defaultValue="LKR" />
              <SaveButton><Plus size={16} /> Add company</SaveButton>
            </form>
          </CompanyCard>
        </div>
      </div>
    </BookOneShell>
  );
}
