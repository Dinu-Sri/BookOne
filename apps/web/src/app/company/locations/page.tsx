import { redirect } from 'next/navigation';
import { getCompanySettingsData } from '@/app/actions/company-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { LocationForms } from '../brand-location-forms';

export default async function CompanyLocationsPage() {
  let tenant;
  let data;
  try {
    [tenant, data] = await Promise.all([getTenantInfo(), getCompanySettingsData()]);
  } catch {
    redirect('/login');
  }

  const rental = Boolean(tenant.modules?.rental);

  return (
    <BookOneShell active="Locations" tenant={tenant}>
      <div className="workspace ux-page set-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Locations</h1>
              <p>
                {rental
                  ? 'Your shops, warehouses, counters, offices and hire bays (On rent, Wash, Repair).'
                  : 'Your shops, warehouses, counters and offices.'}
              </p>
            </div>
          </div>
        </header>
        <div className="ux-split">
          <section className="ux-card co-card" aria-labelledby="locations-title">
            <header className="ux-card-head">
              <h2 id="locations-title">Your locations</h2>
              <span>{data.locations.length}</span>
            </header>
            <LocationForms brands={data.brands} locations={data.locations} rentalModuleOn={rental} />
          </section>
          <aside className="ux-guide set-guide" aria-label="About locations">
            <h2>Good to know</h2>
            <p>Stock is counted per location, and each shop till can be linked to one.</p>
            <p>A location that is already in use cannot be deleted. BookOne tells you what is using it.</p>
          </aside>
        </div>
      </div>
    </BookOneShell>
  );
}
