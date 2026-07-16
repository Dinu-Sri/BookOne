import { redirect } from 'next/navigation';
import { getProduct } from '@/app/actions/inventory';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { ProductForm } from '@/components/inventory/product-form';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenant;
  let product;
  try {
    [tenant, product] = await Promise.all([getTenantInfo(), getProduct(id)]);
  } catch {
    redirect('/login');
  }
  if (!product) redirect('/inventory/products');

  return (
    <BookOneShell active="Products" tenant={tenant}>
      <div className="workspace party-workspace">
        <ProductForm mode="edit" product={product} />
      </div>
    </BookOneShell>
  );
}
