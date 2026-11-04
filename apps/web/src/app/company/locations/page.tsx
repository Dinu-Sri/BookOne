import { redirect } from 'next/navigation';
import { MapPin } from 'lucide-react';
import { getCompanySettingsData } from '@/app/actions/company-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { LocationForms } from '../brand-location-forms';
import { CompanyCard } from '../_components';

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
        <CompanyCard
          title="Locations"
          subtitle={
            tenant.modules?.rental
              ? 'Branches, warehouses, counters, offices, and hire bays (On rent, Wash, Repair). Delete is blocked if the location is already in use.'
              : 'Branches, warehouses, counters, and offices. Delete is blocked if the location is already in use.'
          }
          action={<MapPin size={18} color="var(--brand)" />}
        >
          <LocationForms
            brands={data.brands}
            locations={data.locations}
            rentalModuleOn={Boolean(tenant.modules?.rental)}
          />
        </CompanyCard>
      </div>
    </BookOneShell>
  );
}
