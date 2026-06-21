import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import {
  createBrand,
  createCompany,
  createFinancialYear,
  createLocation,
  getCompanySettingsData,
  saveCompanyProfile,
  saveTaxProfile,
  switchActiveCompany,
} from '@/app/actions/company-settings';
import { auth, signOut } from '@bookone/auth';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button, Card, CardBody, CardHeader, PageHeading } from '@/components/ui/bookone-ui';
import { Building2, CalendarDays, FileText, Landmark, LogOut, MapPin, Plus, Store, UserCircle2 } from 'lucide-react';

export default async function SettingsPage() {
  let tenant;
  let session;
  let settings;
  try {
    [tenant, session, settings] = await Promise.all([getTenantInfo(), auth(), getCompanySettingsData()]);
  } catch {
    redirect('/login');
  }

  const user = session?.user;
  const profile = settings.profile;
  const tax = settings.tax;

  return (
    <BookOneShell active="Settings" tenant={tenant}>
      <div className="workspace">
        <PageHeading
          eyebrow="Business setup"
          title="Company settings"
          lead="Set the legal company, tax identity, financial years, brands, locations, and the companies this user can access."
        />

        <div className="grid two" style={{ alignItems: 'start' }}>
          <Card>
            <CardHeader
              title="Company profile"
              subtitle="Legal identity used by reports, invoices, tax records, and future modules."
              action={<Building2 size={18} color="var(--brand)" />}
            />
            <CardBody>
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
                <div className="field field-full">
                  <Button variant="primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
                    Save company profile
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <div className="grid" style={{ gap: 16 }}>
            <Card>
              <CardHeader
                title="Tax and document defaults"
                subtitle="Numbers and prefixes that later feed invoices, bills, and tax reports."
                action={<FileText size={18} color="var(--brand)" />}
              />
              <CardBody>
                <form action={saveTaxProfile} className="form-grid">
                  <Field label="TIN" name="tin" defaultValue={tax?.tin} />
                  <Field label="VAT no." name="vatNumber" defaultValue={tax?.vatNumber} />
                  <Field label="SVAT no." name="svatNumber" defaultValue={tax?.svatNumber} />
                  <Field label="Tax office" name="taxOffice" defaultValue={tax?.taxOffice} />
                  <Field label="Default tax rate" name="defaultTaxRate" defaultValue={tax?.defaultTaxRate ?? '0'} />
                  <SelectField label="Tax basis" name="taxBasis" defaultValue={tax?.taxBasis ?? 'standard'}>
                    <option value="standard">Standard</option>
                    <option value="cash">Cash basis</option>
                    <option value="accrual">Accrual basis</option>
                  </SelectField>
                  <Field label="Invoice prefix" name="invoicePrefix" defaultValue={tax?.invoicePrefix ?? 'INV'} />
                  <Field label="Bill prefix" name="billPrefix" defaultValue={tax?.billPrefix ?? 'BILL'} />
                  <div className="field field-full">
                    <Button variant="primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
                      Save tax settings
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="User" subtitle="Current signed-in user for this browser session." action={<UserCircle2 size={18} color="var(--brand)" />} />
              <CardBody>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Row label="Name" value={user?.name ?? user?.email ?? '-'} />
                  <Row label="Email" value={user?.email ?? '-'} />
                  <Row label="Role" value={<Badge tone="success">{user?.role ?? 'member'}</Badge>} />
                </div>
                <form
                  action={async () => {
                    'use server';
                    await signOut({ redirectTo: '/login' });
                  }}
                  style={{ marginTop: 16 }}
                >
                  <Button variant="secondary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
                    <LogOut size={16} /> Sign out
                  </Button>
                </form>
              </CardBody>
            </Card>
          </div>
        </div>

        <div className="grid two" style={{ alignItems: 'start', marginTop: 16 }}>
          <Card>
            <CardHeader
              title="Companies"
              subtitle="One login can manage multiple legal companies. Switching refreshes the tenant session."
              action={<Landmark size={18} color="var(--brand)" />}
            />
            <CardBody>
              <div className="balance-list">
                {settings.companies.map((company) => (
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
                <div className="field field-full">
                  <Button variant="primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
                    <Plus size={16} /> Add company
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Financial years"
              subtitle="Create the accounting years used by period close and reports."
              action={<CalendarDays size={18} color="var(--brand)" />}
            />
            <CardBody>
              <form action={createFinancialYear} className="form-grid">
                <Field label="Label" name="label" placeholder="FY 2026/27" />
                <Field label="Start date" name="startDate" type="date" />
                <Field label="End date" name="endDate" type="date" />
                <SelectField label="Status" name="status" defaultValue="open">
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </SelectField>
                <div className="field field-full">
                  <Button variant="primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
                    <Plus size={16} /> Add financial year
                  </Button>
                </div>
              </form>

              <ListEmpty show={settings.financialYears.length === 0}>No financial years yet.</ListEmpty>
              <div className="balance-list" style={{ marginTop: settings.financialYears.length ? 16 : 0 }}>
                {settings.financialYears.map((year) => (
                  <div className="balance-row" key={year.id}>
                    <div>
                      <strong>{year.label}</strong>
                      <span>{year.startDate} to {year.endDate}</span>
                    </div>
                    <Badge tone={year.status === 'closed' ? 'neutral' : 'success'}>{year.status}</Badge>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="grid two" style={{ alignItems: 'start', marginTop: 16 }}>
          <Card>
            <CardHeader title="Brands" subtitle="Organize trading names under the same legal company." action={<Store size={18} color="var(--brand)" />} />
            <CardBody>
              <form action={createBrand} className="form-grid">
                <Field label="Brand name" name="name" placeholder="BookOne" />
                <Field label="Code" name="code" placeholder="BOOK" />
                <TextAreaField label="Notes" name="notes" wide />
                <div className="field field-full">
                  <Button variant="primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
                    <Plus size={16} /> Add brand
                  </Button>
                </div>
              </form>

              <ListEmpty show={settings.brands.length === 0}>No brands yet.</ListEmpty>
              <div className="balance-list" style={{ marginTop: settings.brands.length ? 16 : 0 }}>
                {settings.brands.map((brand) => (
                  <div className="balance-row" key={brand.id}>
                    <div>
                      <strong>{brand.name}</strong>
                      <span>{brand.code ?? 'No code'}{brand.notes ? ` - ${brand.notes}` : ''}</span>
                    </div>
                    <Badge tone="info">Brand</Badge>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Locations" subtitle="Branches, warehouses, counters, and other operating points." action={<MapPin size={18} color="var(--brand)" />} />
            <CardBody>
              <form action={createLocation} className="form-grid">
                <Field label="Location name" name="name" placeholder="Colombo showroom" />
                <Field label="Code" name="code" placeholder="COL-01" />
                <SelectField label="Brand" name="brandId" defaultValue="">
                  <option value="">No brand</option>
                  {settings.brands.map((brand) => (
                    <option value={brand.id} key={brand.id}>{brand.name}</option>
                  ))}
                </SelectField>
                <SelectField label="Type" name="locationType" defaultValue="branch">
                  <option value="branch">Branch</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="counter">POS counter</option>
                  <option value="office">Office</option>
                </SelectField>
                <TextAreaField label="Address" name="address" wide />
                <div className="field field-full">
                  <Button variant="primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
                    <Plus size={16} /> Add location
                  </Button>
                </div>
              </form>

              <ListEmpty show={settings.locations.length === 0}>No locations yet.</ListEmpty>
              <div className="balance-list" style={{ marginTop: settings.locations.length ? 16 : 0 }}>
                {settings.locations.map((location) => (
                  <div className="balance-row" key={location.id}>
                    <div>
                      <strong>{location.name}</strong>
                      <span>{[location.code, location.brandName, location.locationType, location.address].filter(Boolean).join(' - ')}</span>
                    </div>
                    <Badge tone="neutral">Location</Badge>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </BookOneShell>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  placeholder,
  wide = false,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <div className={`field ${wide ? 'field-full' : ''}`.trim()}>
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} className="input" defaultValue={defaultValue ?? ''} placeholder={placeholder} />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} className="input" defaultValue={defaultValue}>
        {children}
      </select>
    </div>
  );
}

function TextAreaField({ label, name, wide = false }: { label: string; name: string; wide?: boolean }) {
  return (
    <div className={`field ${wide ? 'field-full' : ''}`.trim()}>
      <label htmlFor={name}>{label}</label>
      <textarea id={name} name={name} className="input" rows={3} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="balance-row" style={{ padding: '10px 0', border: 'none', background: 'transparent' }}>
      <span style={{ color: 'var(--ink-muted)', fontSize: 12, fontWeight: 750 }}>{label}</span>
      <strong style={{ fontSize: 13 }}>{value}</strong>
    </div>
  );
}

function ListEmpty({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return (
    <p style={{ marginTop: 14, color: 'var(--ink-muted)', fontSize: 13 }}>
      {children}
    </p>
  );
}
