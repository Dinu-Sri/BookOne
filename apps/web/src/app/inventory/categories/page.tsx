import { redirect } from 'next/navigation';
import { Tags } from 'lucide-react';
import { getCompanySettingsData } from '@/app/actions/company-settings';
import { listProductCategories } from '@/app/actions/product-categories';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CategoryForms } from '@/components/inventory/category-forms';
import { Card, CardBody, CardHeader } from '@/components/ui/bookone-ui';
import { ProductBrandsCard } from '@/components/inventory/product-brands-card';
import { listProductBrands } from '@/app/actions/product-catalog';
import { probeModuleWrite } from '@/lib/module-access';

export default async function ProductCategoriesPage() {
  let tenant;
  let categories;
  let masters;
  try {
    [tenant, categories, masters] = await Promise.all([
      getTenantInfo(),
      listProductCategories(),
      getCompanySettingsData(),
    ]);
  } catch {
    redirect('/login');
  }
  const [productBrands, canWrite] = await Promise.all([
    listProductBrands().catch(() => []),
    probeModuleWrite('inventory').catch(() => false),
  ]);

  return (
    <BookOneShell active="Categories" tenant={tenant}>
      <div className="workspace">
        <Card>
          <CardHeader
            title="Product categories"
            subtitle="Parent and child groups (WordPress-style). Optional brand and location for later inventory reports. Delete is blocked if products or child categories still use it."
            action={<Tags size={18} color="var(--brand)" />}
          />
          <CardBody>
            <CategoryForms
              categories={categories}
              brands={masters.brands}
              locations={masters.locations.map((l) => ({
                id: l.id,
                name: l.name,
                code: l.code,
                brandId: l.brandId,
              }))}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Product brands" subtitle="Makers shown on your online stores." />
          <CardBody>
            <ProductBrandsCard brands={productBrands} canWrite={canWrite} />
          </CardBody>
        </Card>
      </div>
    </BookOneShell>
  );
}
