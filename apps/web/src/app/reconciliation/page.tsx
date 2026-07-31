import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { listBankImportsForHub } from '@/app/actions/statement-import';
import { BankImportsHub } from '@/components/bank-import-studio/bank-imports-hub';
import { BankMatchWizard } from '@/components/bank-import-studio/match-wizard';
import { BookOneShell } from '@/components/layout/bookone-shell';

/**
 * Full ERP bank reconciliation = same engine as cashbook:
 * Bank Imports hub + Match/Create workbench (BankMatchWizard).
 * No legacy StatementImportWizard. No period-lock clutter.
 */
export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams?: Promise<{ importId?: string; period?: string }> | { importId?: string; period?: string };
}) {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const importId = params?.importId;

  if (importId) {
    return (
      <BookOneShell active="Reconciliation" tenant={tenant}>
        <div className="workspace bih-erp-workspace">
          <div className="bih-erp-head">
            <div>
              <p className="eyebrow">Bank reconciliation</p>
              <h1 className="page-title" style={{ margin: '4px 0 0' }}>
                Match to books
              </h1>
            </div>
            <Link href="/reconciliation" className="bis-btn secondary">
              ← All imports
            </Link>
          </div>
          <BankMatchWizard
            importId={importId}
            hubHref="/reconciliation"
            homeHref="/dashboard"
          />
        </div>
      </BookOneShell>
    );
  }

  let items: Awaited<ReturnType<typeof listBankImportsForHub>> = [];
  try {
    items = await listBankImportsForHub(40);
  } catch {
    items = [];
  }

  // ERP workbench links stay on /reconciliation so shell stays ERP
  const erpItems = items.map((i) => ({
    ...i,
    workbenchPath: `/reconciliation?importId=${i.id}`,
  }));

  return (
    <BookOneShell active="Reconciliation" tenant={tenant}>
      <div className="workspace bih-erp-workspace">
        <div className="bih-erp-head">
          <div>
            <p className="eyebrow">Bank reconciliation</p>
            <h1 className="page-title" style={{ margin: '4px 0 0' }}>
              Bank imports
            </h1>
            <p className="card-subtitle" style={{ marginTop: 6, maxWidth: 52 * 8 }}>
              Same engine as cashbook: import → match existing books → optionally create new
              entries. Staging only until you confirm.
            </p>
          </div>
          <Link href="/reconciliation/import" className="bis-btn primary">
            Import bank file
          </Link>
        </div>
        <BankImportsHub
          items={erpItems}
          importHref="/reconciliation/import"
          workbenchBase="/reconciliation"
        />
      </div>
    </BookOneShell>
  );
}
