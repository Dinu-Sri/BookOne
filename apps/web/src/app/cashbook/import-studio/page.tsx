import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listLiquidAccounts } from '@/app/actions/cashbook-banks';
import { getStudioDraft } from '@/app/actions/bank-import-studio';
import { BankImportStudioWizard } from '@/components/bank-import-studio/studio-wizard';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { isBankImportStudioEnabled } from '@/lib/bank-import-studio-flag';
import { canAccessFullErp } from '@/lib/entity-kind';
import { requireEntityTenant } from '@/lib/require-entity-shell';

export default async function CashbookImportStudioPage({
  searchParams,
}: {
  searchParams?: { domain?: string; draft?: string };
}) {
  if (!isBankImportStudioEnabled()) {
    redirect('/cashbook/import');
  }

  const tenant = await requireEntityTenant({
    requirePersonalShell: true,
    loginFrom: '/cashbook/import-studio',
  });

  const domainParam = searchParams?.domain;
  const bookDomain =
    domainParam === 'personal' || domainParam === 'business' ? domainParam : null;

  const [banks, draft] = await Promise.all([
    listLiquidAccounts(),
    searchParams?.draft ? getStudioDraft(searchParams.draft) : Promise.resolve(null),
  ]);

  const fullErp = canAccessFullErp(tenant.entityKind, tenant.capabilityTier);

  return (
    <CashbookShell
      title={`${tenant.name} · Import studio`}
      active="home"
      showFullErpLink={fullErp}
    >
      <div className="cashbook-import-page">
        <div className="cashbook-import-head">
          <div>
            <p className="eyebrow">Smart Bank Import Studio</p>
            <h1 className="cashbook-import-title">Import bank statement</h1>
            <p className="cashbook-import-sub">
              Guided setup for any bank Excel/CSV. We never change your books until you finish
              review and reconciliation.
            </p>
          </div>
          <Link href="/cashbook" className="cashbook-import-back">
            ← Back to cashbook
          </Link>
        </div>
        <BankImportStudioWizard
          banks={banks}
          source="cashbook"
          bookDomain={bookDomain}
          initialDraft={draft}
        />
        <p className="bis-legacy-link">
          <Link href="/cashbook/import">Use classic importer instead</Link>
        </p>
      </div>
    </CashbookShell>
  );
}
