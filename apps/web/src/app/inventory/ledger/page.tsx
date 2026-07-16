import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listStockMovements } from '@/app/actions/inventory';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { StockLedgerList } from '@/components/inventory/stock-ledger-list';

export default async function StockLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string }>;
}) {
  const params = await searchParams;
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([
      getTenantInfo(),
      listStockMovements({ from: params.from, to: params.to, q: params.q }),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Stock Ledger" tenant={tenant}>
      <Suspense fallback={<div className="workspace">Loading…</div>}>
        <StockLedgerList rows={rows} />
      </Suspense>
    </BookOneShell>
  );
}
