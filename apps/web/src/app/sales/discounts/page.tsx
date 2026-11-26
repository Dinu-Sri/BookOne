import { redirect } from 'next/navigation';
import { listDiscounts } from '@/app/actions/discounts';
import { getTenantInfo } from '@/app/actions/workspace';
import { jobCanWrite } from '@/lib/access';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { DiscountList } from '@/components/sales/discount-list';

export default async function DiscountsPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listDiscounts()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Discounts" tenant={tenant}>
      <DiscountList rows={rows} canWrite={jobCanWrite(tenant, 'Discounts')} />
    </BookOneShell>
  );
}
