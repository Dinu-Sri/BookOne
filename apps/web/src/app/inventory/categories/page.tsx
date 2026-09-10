import { redirect } from 'next/navigation';
import { Tags } from 'lucide-react';
import { listProductCategories } from '@/app/actions/product-categories';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CategoryForms } from '@/components/inventory/category-forms';
import { Card, CardBody, CardHeader } from '@/components/ui/bookone-ui';

export default async function ProductCategoriesPage() {
  let tenant;
  let categories;
  try {
    [tenant, categories] = await Promise.all([getTenantInfo(), listProductCategories()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Categories" tenant={tenant}>
      <div className="workspace">
        <Card>
          <CardHeader
            title="Product categories"
            subtitle="Groups such as Chairs or Lighting. Create them here or from a product. Delete is blocked if products still use the name."
            action={<Tags size={18} color="var(--brand)" />}
          />
          <CardBody>
            <CategoryForms categories={categories} />
          </CardBody>
        </Card>
      </div>
    </BookOneShell>
  );
}
