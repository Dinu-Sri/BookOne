import Link from 'next/link';
import { listLiquidAccounts } from '@/app/actions/cashbook-banks';
import { getStudioDraft } from '@/app/actions/bank-import-studio';
import { BankImportStudioWizard } from '@/components/bank-import-studio/studio-wizard';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { canAccessFullErp } from '@/lib/entity-kind';
import { requireEntityTenant } from '@/lib/require-entity-shell';

/**
 * Final Smart Bank Import Studio — guided Excel/CSV import (no feature flag).
 * Staging bank lines only; does not post journals until later recon/create.
 */
export default async function CashbookImportPage({
  searchParams,
}: {
  searchParams?: { domain?: string; draft?: string; importId?: string };
}) {
  const tenant = await requireEntityTenant({
    requirePersonalShell: true,
    loginFrom: '/cashbook/import',
  });

  const domainParam = searchParams?.domain;
  const bookDomain =
    domainParam === 'personal' || domainParam === 'business' ? domainParam : null;

  const draftId = searchParams?.draft ?? searchParams?.importId;
  const [banks, draft] = await Promise.all([
    listLiquidAccounts(),
    draftId ? getStudioDraft(draftId) : Promise.resolve(null),
  ]);

  const fullErp = canAccessFullErp(tenant.entityKind, tenant.capabilityTier);

  return (
    <CashbookShell
      title={`${tenant.name} · Import bank`}
      active="home"
      showFullErpLink={fullErp}
    >
      <div className="cashbook-import-page">
        <div className="cashbook-import-head">
          <h1 className="cashbook-import-title">Import bank</h1>
          <Link href="/cashbook" className="cashbook-import-back">
            ← Cashbook
          </Link>
        </div>
        <BankImportStudioWizard
          banks={banks}
          source="cashbook"
          bookDomain={bookDomain}
          initialDraft={draft}
        />
      </div>
    </CashbookShell>
  );
}
