import { redirect } from 'next/navigation';
import { getDiscount } from '@/app/actions/discounts';
import { getTenantInfo } from '@/app/actions/workspace';
import { jobCanWrite } from '@/lib/access';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { DiscountForm } from '@/components/sales/discount-form';

export default async function EditDiscountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenant;
  let discount;
  try {
    [tenant, discount] = await Promise.all([getTenantInfo(), getDiscount(id)]);
  } catch {
    redirect('/login');
  }
  if (!discount) redirect('/sales/discounts');

  if (!jobCanWrite(tenant, 'Discounts')) redirect('/sales/discounts?flash=denied_write');

  return (
    <BookOneShell active="Discounts" tenant={tenant}>
      <div className="workspace party-workspace">
        <DiscountForm mode="edit" discount={discount} />
      </div>
    </BookOneShell>
  );
}
