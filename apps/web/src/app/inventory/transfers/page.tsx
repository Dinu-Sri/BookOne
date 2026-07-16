import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listStockDocs } from '@/app/actions/inventory';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { StockDocsList } from '@/components/inventory/stock-docs-list';

export default async function TransfersPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listStockDocs('transfer')]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Stock Transfers" tenant={tenant}>
      <Suspense fallback={<div className="workspace">Loading…</div>}>
        <StockDocsList docType="transfer" rows={rows} />
      </Suspense>
    </BookOneShell>
  );
}
