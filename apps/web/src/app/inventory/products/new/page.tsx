import { redirect } from 'next/navigation';
import { listProductDimensionOptions, listProducts } from '@/app/actions/inventory';
import { listProductCategories } from '@/app/actions/product-categories';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { ProductForm } from '@/components/inventory/product-form';

export default async function NewProductPage() {
  let tenant;
  let rentalCatalog: { id: string; sku: string; name: string }[] = [];
  let categories: Awaited<ReturnType<typeof listProductCategories>> = [];
  let dims: Awaited<ReturnType<typeof listProductDimensionOptions>> = { brands: [], locations: [] };
  try {
    [tenant, rentalCatalog, categories, dims] = await Promise.all([
      getTenantInfo(),
      listProducts({ productType: 'rental', status: 'active' }).then((rows) =>
        rows.map((r) => ({ id: r.id, sku: r.sku, name: r.name })),
      ),
      listProductCategories(),
      listProductDimensionOptions(),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Products" tenant={tenant}>
      <div className="workspace party-workspace">
        <ProductForm
          mode="create"
          rentalCatalog={rentalCatalog}
          categories={categories}
          brands={dims.brands}
          locations={dims.locations}
        />
      </div>
    </BookOneShell>
  );
}
