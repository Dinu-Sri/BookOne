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

  // Non–super-admin: hide (same gate as Control Room)
  if (!data.isSuperAdmin) {
    redirect('/');
  }

  return (
    <BookOneShell active="ERP Health Check" tenant={tenant}>
      <section className="workspace" style={{ display: 'grid', gap: 14 }}>
        <div className="page-heading">
          <div>
            <div className="eyebrow">CONTROL ROOM</div>
            <h1 className="h1">ERP Health Check</h1>
            <p className="lead">
              One place to run a mini business day on a <strong>staging</strong> company and see
              pass/fail for each step. Use this after deploy to confirm sales, purchase, stock, and
              books still work together.
            </p>
          </div>
          <span className="badge info">Super admin</span>
        </div>

        <HealthCheckPanel
          environment={data.environment}
          canRun={data.canRun}
          recentRuns={data.recentRuns}
        />
      </section>
    </BookOneShell>
  );
}
