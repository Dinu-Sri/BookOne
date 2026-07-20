import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { getHealthCheckPageData } from '@/app/actions/health-check';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { HealthCheckPanel } from '@/components/control-room/health-check-panel';

export default async function ControlRoomHealthCheckPage() {
  let tenant;
  let data;
  try {
    tenant = await getTenantInfo();
    data = await getHealthCheckPageData();
  } catch {
    redirect('/login');
  }

  if (!data.isSuperAdmin) {
    redirect('/');
  }

  return (
    <BookOneShell active="ERP Health Check" tenant={tenant}>
      <section className="workspace party-workspace" style={{ display: 'grid', gap: 14 }}>
        <HealthCheckPanel
          environment={data.environment}
          canRun={data.canRun}
          recentRuns={data.recentRuns}
        />
      </section>
    </BookOneShell>
  );
}
