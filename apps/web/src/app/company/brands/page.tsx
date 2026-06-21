import { redirect } from 'next/navigation';
import { Plus, Store } from 'lucide-react';
import { createBrand, getCompanySettingsData } from '@/app/actions/company-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge } from '@/components/ui/bookone-ui';
import { CompanyCard, EmptyLine, Field, SaveButton, TextAreaField } from '../_components';

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
          <form action={createBrand} className="form-grid">
            <Field label="Brand name" name="name" placeholder="BookOne" />
            <Field label="Code" name="code" placeholder="BOOK" />
            <TextAreaField label="Notes" name="notes" wide />
            <SaveButton><Plus size={16} /> Add brand</SaveButton>
          </form>
          <div className="balance-list" style={{ marginTop: 16 }}>
            <EmptyLine show={data.brands.length === 0}>No brands yet.</EmptyLine>
            {data.brands.map((brand) => (
              <div className="balance-row" key={brand.id}>
                <div>
                  <strong>{brand.name}</strong>
                  <span>{brand.code ?? 'No code'}{brand.notes ? ` - ${brand.notes}` : ''}</span>
                </div>
                <Badge tone="info">Brand</Badge>
              </div>
            ))}
          </div>
        </CompanyCard>
      </div>
    </BookOneShell>
  );
}
