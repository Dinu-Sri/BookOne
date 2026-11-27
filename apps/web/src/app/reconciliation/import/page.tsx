import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
      <div className="workspace bih-erp-workspace bis-page">
        <div className="bis-page-head">
          <Link href="/reconciliation" className="bis-page-back" aria-label="Back to bank reconciliation">
            <ArrowLeft size={16} aria-hidden />
          </Link>
          <div>
            <h1 className="page-title">Import bank statement</h1>
            <p>Upload the statement from your bank. Nothing changes in your books until you confirm each item.</p>
          </div>
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
