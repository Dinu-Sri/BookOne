import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listLiquidAccounts } from '@/app/actions/cashbook-banks';
import { getStudioDraft } from '@/app/actions/bank-import-studio';
import { getTenantInfo } from '@/app/actions/workspace';
import { BankImportStudioWizard } from '@/components/bank-import-studio/studio-wizard';
import { BookOneShell } from '@/components/layout/bookone-shell';

/**
 * Full ERP uses the **same** Import Studio as cashbook (one engine).
 * Company tenants cannot use /cashbook/* shell — this route wraps studio in ERP chrome.
 */
export default async function ErpBankImportPage({
  searchParams,
}: {
  searchParams?: Promise<{ draft?: string; importId?: string }> | { draft?: string; importId?: string };
}) {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const draftId = params?.draft ?? params?.importId;
  const [banks, draft] = await Promise.all([
    listLiquidAccounts(),
    draftId ? getStudioDraft(draftId) : Promise.resolve(null),
  ]);

  return (
    <BookOneShell active="Reconciliation" tenant={tenant}>
      <div className="workspace bih-erp-workspace">
        <div className="bih-erp-head">
          <div>
            <p className="eyebrow">Bank reconciliation</p>
            <h1 className="page-title" style={{ margin: '4px 0 0' }}>
              Import bank file
            </h1>
            <p className="card-subtitle" style={{ marginTop: 6 }}>
              Same Smart Bank Import Studio as cashbook. Staging only — match after save.
            </p>
          </div>
          <Link href="/reconciliation" className="bis-btn secondary">
            ← Bank imports
          </Link>
        </div>
        <BankImportStudioWizard
          banks={banks}
          source="erp_recon"
          initialDraft={draft}
        />
      </div>
    </BookOneShell>
  );
}
