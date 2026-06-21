import { redirect } from 'next/navigation';
import { MapPin, Plus } from 'lucide-react';
import { createLocation, getCompanySettingsData } from '@/app/actions/company-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge } from '@/components/ui/bookone-ui';
import { CompanyCard, EmptyLine, Field, SaveButton, SelectField, TextAreaField } from '../_components';

export default async function CompanyLocationsPage() {
  let tenant;
  let data;
  try {
    [tenant, data] = await Promise.all([getTenantInfo(), getCompanySettingsData()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Locations" tenant={tenant}>
      <div className="workspace">
        <CompanyCard title="Locations" subtitle="Branches, warehouses, counters, and offices." action={<MapPin size={18} color="var(--brand)" />}>
          <form action={createLocation} className="form-grid">
            <Field label="Location name" name="name" placeholder="Colombo showroom" />
            <Field label="Code" name="code" placeholder="COL-01" />
            <SelectField label="Brand" name="brandId" defaultValue="">
              <option value="">No brand</option>
              {data.brands.map((brand) => (
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
            <SaveButton><Plus size={16} /> Add location</SaveButton>
          </form>
          <div className="balance-list" style={{ marginTop: 16 }}>
            <EmptyLine show={data.locations.length === 0}>No locations yet.</EmptyLine>
            {data.locations.map((location) => (
              <div className="balance-row" key={location.id}>
                <div>
                  <strong>{location.name}</strong>
                  <span>{[location.code, location.brandName, location.locationType, location.address].filter(Boolean).join(' - ')}</span>
                </div>
                <Badge tone="neutral">Location</Badge>
              </div>
            ))}
          </div>
        </CompanyCard>
      </div>
    </BookOneShell>
  );
}
