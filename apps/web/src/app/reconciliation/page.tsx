import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { listReconciliationSessions } from '@/app/actions/bank-reconciliation';
import { ReconciliationInbox } from '@/components/reconciliation/reconciliation-inbox';
import { BookOneShell } from '@/components/layout/bookone-shell';

/**
 * ERP Bank Reconciliation Inbox — sessions by bank account + period.
 * Same engine as cashbook. Import Studio remains at /reconciliation/import.
 */
export default async function ReconciliationPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  let sessions: Awaited<ReturnType<typeof listReconciliationSessions>> = [];
  try {
    sessions = await listReconciliationSessions();
  } catch {
    sessions = [];
  }

  return (
    <BookOneShell active="Reconciliation" tenant={tenant}>
      <div className="workspace bih-erp-workspace">
        <div className="bih-erp-head">
          <div>
            <p className="eyebrow">Banking</p>
            <h1 className="page-title" style={{ margin: '4px 0 0' }}>
              Bank reconciliation
            </h1>
            <p className="card-subtitle" style={{ marginTop: 6, maxWidth: 48 * 8 }}>
              Match bank statements to BookOne by account and period. Nothing posts until you
              confirm.
            </p>
          </div>
          <Link href="/reconciliation/import" className="bis-btn primary">
            Import bank file
          </Link>
        </div>
        <ReconciliationInbox
          sessions={sessions}
          importHref="/reconciliation/import"
          sessionBase="/reconciliation/session"
        />
      </div>
    </BookOneShell>
  );
}
