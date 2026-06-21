import { redirect } from 'next/navigation';
import { Store } from 'lucide-react';
import { getCompanySettingsData } from '@/app/actions/company-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { BrandForms } from '../brand-location-forms';
import { CompanyCard } from '../_components';

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
      <div className="workspace">
        <CompanyCard title="Brands" subtitle="Trading names under the current legal company." action={<Store size={18} color="var(--brand)" />}>
          <BrandForms brands={data.brands} />
        </CompanyCard>
      </div>
    </BookOneShell>
  );
}
