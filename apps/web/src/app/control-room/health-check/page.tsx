import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
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
      <div className="workspace ux-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Health check</h1>
              <p>Checks that the server, database and background jobs are working.</p>
            </div>
          </div>
        </header>
        <div className="ux-empty">
          <h2>No checks yet</h2>
          <p>Server and database checks will appear here. Until then, use the Portainer stack logs to see the server&apos;s state.</p>
        </div>
      </div>
    </BookOneShell>
  );
}
