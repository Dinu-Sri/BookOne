import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Card } from '@/components/ui/bookone-ui';
import { isPlatformAdmin } from '@/lib/platform-admin';

export default async function ControlRoomHealthCheckPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  if (!isPlatformAdmin(tenant)) {
    redirect('/');
  }

  return (
    <BookOneShell active="ERP Health Check" tenant={tenant}>
      <section className="workspace party-workspace" style={{ display: 'grid', gap: 14 }}>
        <Card>
          <div className="card-body">
            <h2 className="card-title">ERP Health Check</h2>
            <p style={{ color: 'var(--ink-muted)', marginTop: 8 }}>
              This screen is reserved for operational checks. Tools will be added later.
            </p>
          </div>
        </Card>
      </section>
    </BookOneShell>
  );
}
