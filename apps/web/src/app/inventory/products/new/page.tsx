import { redirect } from 'next/navigation';
import { listProducts } from '@/app/actions/inventory';
import { listProductCategories } from '@/app/actions/product-categories';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { ProductForm } from '@/components/inventory/product-form';

export default async function NewProductPage() {
  let tenant;
  let rentalCatalog: { id: string; sku: string; name: string }[] = [];
  let categories: Awaited<ReturnType<typeof listProductCategories>> = [];
  try {
    [tenant, rentalCatalog, categories] = await Promise.all([
      getTenantInfo(),
      listProducts({ productType: 'rental', status: 'active' }).then((rows) =>
        rows.map((r) => ({ id: r.id, sku: r.sku, name: r.name })),
      ),
      listProductCategories(),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Products" tenant={tenant}>
      <div className="workspace party-workspace">
        <ProductForm mode="create" rentalCatalog={rentalCatalog} categories={categories} />
      </div>
    </BookOneShell>
  );
}
