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
        <CompanyCard title="Locations" subtitle="Branches, warehouses, counters, and offices." action={<MapPin size={18} color="var(--brand)" />}>
          <LocationForms brands={data.brands} locations={data.locations} />
        </CompanyCard>
      </div>
    </BookOneShell>
  );
}
