import { redirect } from 'next/navigation';
import { listRentalJobs } from '@/app/actions/rental-bookings';
import { getTenantInfo } from '@/app/actions/workspace';
import { RentalOpsPanel } from '@/components/inventory/rental-ops-panel';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { ModulePageHeader } from '@/components/module/list-page';

export default async function OnRentPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listRentalJobs()]);
  } catch {
    redirect('/login');
  }

  const overdue = rows.filter((r) => r.overdue).length;

  return (
    <BookOneShell active="Dispatch / returns" tenant={tenant}>
      <div className="workspace party-workspace" style={{ display: 'grid', gap: 14 }}>
        <ModulePageHeader
          eyebrow="Rental"
          title="Dispatch / returns"
          lead={
            overdue
              ? `${rows.length} open hire lines · ${overdue} overdue.`
              : 'Dispatch reserved kit to On rent, then record good / damaged / missing on return.'
          }
        />
        <RentalOpsPanel rows={rows} />
      </div>
    </BookOneShell>
  );
}
