import Link from 'next/link';
import { listLiquidAccounts } from '@/app/actions/cashbook-banks';
import { getStatementImport } from '@/app/actions/statement-import';
import { StatementImportWizard } from '@/components/statement-import/statement-import-wizard';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { canAccessFullErp } from '@/lib/entity-kind';
import { requireEntityTenant } from '@/lib/require-entity-shell';

export default async function CashbookImportPage({
  searchParams,
}: {
  searchParams?: { domain?: string; importId?: string };
}) {
  const tenant = await requireEntityTenant({
    requirePersonalShell: true,
    loginFrom: '/cashbook/import',
  });

  const domainParam = searchParams?.domain;
  const bookDomain =
    domainParam === 'personal' || domainParam === 'business' ? domainParam : null;

  const [banks, existing] = await Promise.all([
    listLiquidAccounts(),
    searchParams?.importId
      ? getStatementImport(searchParams.importId)
      : Promise.resolve(null),
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
          <div>
            <p className="eyebrow">Bank statement</p>
            <h1 className="cashbook-import-title">Import bank Excel</h1>
            <p className="cashbook-import-sub">
              Upload your bank monthly sheet. We match what is already in your books, then you
              confirm anything new. Nothing posts until you say so.
            </p>
          </div>
          <Link href="/cashbook" className="cashbook-import-back">
            ← Back to cashbook
          </Link>
        </div>

        <StatementImportWizard
          banks={banks}
          source="cashbook"
          bookDomain={bookDomain}
          variant="cashbook"
          initialImport={existing}
        />
      </div>
    </CashbookShell>
  );
}
