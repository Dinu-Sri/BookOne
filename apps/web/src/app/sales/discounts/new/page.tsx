import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { jobCanWrite } from '@/lib/access';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { DiscountForm } from '@/components/sales/discount-form';

export default async function NewDiscountPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  if (!jobCanWrite(tenant, 'Discounts')) redirect('/sales/discounts?flash=denied_write');

  return (
    <BookOneShell active="Discounts" tenant={tenant}>
      <div className="workspace party-workspace">
        <DiscountForm mode="create" />
      </div>
    </BookOneShell>
  );
}
