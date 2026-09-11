import { redirect } from 'next/navigation';
import { getProduct, listProductDimensionOptions, listProducts } from '@/app/actions/inventory';
import { listProductCategories } from '@/app/actions/product-categories';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { ProductForm } from '@/components/inventory/product-form';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenant;
  let product;
  let rentalCatalog: { id: string; sku: string; name: string }[] = [];
  let categories: Awaited<ReturnType<typeof listProductCategories>> = [];
  let dims: Awaited<ReturnType<typeof listProductDimensionOptions>> = { brands: [], locations: [] };
  try {
    [tenant, product, rentalCatalog, categories, dims] = await Promise.all([
      getTenantInfo(),
      getProduct(id),
      listProducts({ productType: 'rental', status: 'active' }).then((rows) =>
        rows.map((r) => ({ id: r.id, sku: r.sku, name: r.name })),
      ),
      listProductCategories(),
      listProductDimensionOptions(),
    ]);
  } catch {
    redirect('/login');
  }
  if (!product) redirect('/inventory/products');

  return (
    <BookOneShell active="Products" tenant={tenant}>
      <div className="workspace party-workspace">
        <ProductForm
          mode="edit"
          product={product}
          rentalCatalog={rentalCatalog}
          categories={categories}
          brands={dims.brands}
          locations={dims.locations}
        />
      </div>
    </BookOneShell>
  );
}
