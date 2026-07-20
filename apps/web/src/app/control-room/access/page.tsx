import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listPlatformUsers } from '@/app/actions/platform';
import { getTenantInfo } from '@/app/actions/workspace';
import { AccessUsersScreen } from '@/components/control-room/access-users-screen';
import { BookOneShell } from '@/components/layout/bookone-shell';

export default async function AccessPage() {
  let tenant;
  let rows;
  try {
    tenant = await getTenantInfo();
    if (tenant.userRole !== 'super_admin' && tenant.userEmail !== 'dinu.sri.m@gmail.com') {
      redirect('/');
    }
    rows = await listPlatformUsers();
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Access" tenant={tenant}>
      <Suspense fallback={<div className="workspace">Loading…</div>}>
        <AccessUsersScreen initialRows={rows} />
      </Suspense>
    </BookOneShell>
  );
}
