import { redirect } from 'next/navigation';
import { getCompanySettingsData } from '@/app/actions/company-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { BrandForms } from '../brand-location-forms';

export default async function CompanyBrandsPage() {
  let tenant;
  let data;
  try {
    [tenant, data] = await Promise.all([getTenantInfo(), getCompanySettingsData()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Brands" tenant={tenant}>
      <div className="workspace ux-page set-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Brands</h1>
              <p>The names you trade under within this company. Each brand can print its own website and bank details.</p>
            </div>
          </div>
        </header>
        <div className="ux-split">
          <section className="ux-card co-card" aria-labelledby="brands-title">
            <header className="ux-card-head">
              <h2 id="brands-title">Your brands</h2>
              <span>{data.brands.length}</span>
            </header>
            <BrandForms brands={data.brands} />
          </section>
          <aside className="ux-guide set-guide" aria-label="About brands">
            <h2>Good to know</h2>
            <p>Link a brand to a location on the Locations tab. Shop tills linked to that location then use that brand.</p>
          </aside>
        </div>
      </div>
    </BookOneShell>
  );
}
