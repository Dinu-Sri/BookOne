import { redirect } from 'next/navigation';
import { listMonthLocks } from '@/app/actions/period-close';
import { getTenantInfo } from '@/app/actions/workspace';
import { ClosedMonths } from '@/components/accounts/closed-months';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { assertScreenAccess, jobCanWrite } from '@/lib/access';

export default async function ClosedMonthsPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listMonthLocks()]);
  } catch {
    redirect('/login?from=/accounts/months');
  }
  await assertScreenAccess('/accounts', 'read');
  const canWrite = jobCanWrite(tenant, 'Accounts');

  return (
    <BookOneShell active="Accounts" tenant={tenant}>
      <div className="workspace ux-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Closed months</h1>
              <p>Close a month when its books are done, so nothing dated in it can change.</p>
            </div>
          </div>
        </header>
        <div className="ux-split">
          <ClosedMonths rows={rows} canWrite={canWrite} />
          <aside className="ux-guide" aria-label="About closed months">
            <h2>Good to know</h2>
            <p>
              <strong>Example:</strong> you close October. A bill dated 15 October can no longer be posted; enter it in
              November, or reopen October with a reason.
            </p>
            <p>Reopening is recorded with your reason. Close the month again when the correction is done.</p>
          </aside>
        </div>
      </div>
    </BookOneShell>
  );
}
