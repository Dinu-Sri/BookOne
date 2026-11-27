import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import {
  listBankImports,
  listReconciliationSessions,
} from '@/app/actions/bank-reconciliation';
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
  let imports: Awaited<ReturnType<typeof listBankImports>> = [];
  try {
    sessions = await listReconciliationSessions();
  } catch {
    sessions = [];
  }
  try {
    imports = await listBankImports();
  } catch {
    imports = [];
  }

  return (
    <BookOneShell active="Reconciliation" tenant={tenant}>
      <div className="workspace bih-erp-workspace rin-page">
        <div className="rin-head">
          <div>
            <h1 className="page-title">Bank reconciliation</h1>
            <p>Once a month, check that your bank statement and BookOne agree. Nothing is recorded until you confirm.</p>
          </div>
          <Link href="/reconciliation/import" className="button primary">
            Import bank statement
          </Link>
        </div>
        <ReconciliationInbox
          sessions={sessions}
          initialImports={imports}
          importHref="/reconciliation/import"
          sessionBase="/reconciliation/session"
          showImportButton={false}
        />
      </div>
    </BookOneShell>
  );
}
