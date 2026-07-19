import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listProducts, listStockMovements } from '@/app/actions/inventory';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { StockLedgerList } from '@/components/inventory/stock-ledger-list';

export default async function StockLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string; productId?: string }>;
}) {
  const params = await searchParams;
  let tenant;
  let rows;
  let productLabel: string | null = null;
  try {
    [tenant, rows] = await Promise.all([
      getTenantInfo(),
      listStockMovements({
        from: params.from,
        to: params.to,
        q: params.q,
        productId: params.productId,
      }),
    ]);
    if (params.productId) {
      const products = await listProducts({ status: 'all' }).catch(() => []);
      const p = products.find((x) => x.id === params.productId);
      productLabel = p ? `${p.sku} — ${p.name}` : params.productId;
    }
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Stock Ledger" tenant={tenant}>
      <Suspense fallback={<div className="workspace">Loading…</div>}>
        <StockLedgerList
          rows={rows}
          productId={params.productId}
          productLabel={productLabel}
        />
      </Suspense>
    </BookOneShell>
  );
}
