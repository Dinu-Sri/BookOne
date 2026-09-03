import { redirect } from 'next/navigation';
import { listRentalCalendar } from '@/app/actions/rental-bookings';
import { listProducts } from '@/app/actions/inventory';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { RentalCalendar } from '@/components/inventory/rental-calendar';

function monthBounds(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(y!, m!, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}

export default async function InventoryCalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string; productId?: string }> | { month?: string; productId?: string };
}) {
  const sp = (await searchParams) ?? {};
  const now = new Date();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month)
    ? sp.month
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { from, to } = monthBounds(month);
  const productId = sp.productId || null;

  let tenant;
  let data;
  let products: { id: string; sku: string; name: string }[] = [];
  try {
    [tenant, data, products] = await Promise.all([
      getTenantInfo(),
      listRentalCalendar({ from, to, productId }),
      listProducts({ productType: 'rental', status: 'active' }).then((rows) =>
        rows.map((r) => ({ id: r.id, sku: r.sku, name: r.name })),
      ),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Rental calendar" tenant={tenant}>
      <RentalCalendar month={month} productId={productId} products={products} events={data.events} bars={data.bars} />
    </BookOneShell>
  );
}
