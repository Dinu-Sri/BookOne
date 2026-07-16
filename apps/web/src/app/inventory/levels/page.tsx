import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listStockLevels } from '@/app/actions/inventory';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { StockLevelsList } from '@/components/inventory/stock-levels-list';

export default async function StockLevelsPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listStockLevels()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Stock Levels" tenant={tenant}>
      <Suspense fallback={<div className="workspace">Loading…</div>}>
        <StockLevelsList rows={rows} />
      </Suspense>
    </BookOneShell>
  );
}
