import Link from 'next/link';
import { listBankImportsForHub } from '@/app/actions/statement-import';
import { BankImportsHub } from '@/components/bank-import-studio/bank-imports-hub';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { canAccessFullErp } from '@/lib/entity-kind';
import { requireEntityTenant } from '@/lib/require-entity-shell';

/**
 * Bank Imports inbox (personal / sole prop).
 * Staging files → open workbench at /cashbook/match?importId=
 */
export default async function CashbookBankImportsPage() {
  const tenant = await requireEntityTenant({
    requirePersonalShell: true,
    loginFrom: '/cashbook/bank-imports',
  });

  const fullErp = canAccessFullErp(tenant.entityKind, tenant.capabilityTier);
  let items: Awaited<ReturnType<typeof listBankImportsForHub>> = [];
  try {
    items = await listBankImportsForHub(40);
  } catch {
    items = [];
  }

  return (
    <CashbookShell
      title={`${tenant.name} · Bank imports`}
      active="home"
      showFullErpLink={fullErp}
    >
      <div className="cashbook-import-page">
        <div className="cashbook-import-head">
          <h1 className="cashbook-import-title">Bank imports</h1>
          <Link href="/cashbook" className="cashbook-import-back">
            ← Cashbook
          </Link>
        </div>
        <p className="bih-lead">
          Files you imported stay here until you match them to cashbook entries or create new ones.
          Your cashbook list only shows real books — not raw bank rows.
        </p>
        <BankImportsHub
          items={items}
          importHref="/cashbook/import"
          workbenchBase="/cashbook/match"
        />
      </div>
    </CashbookShell>
  );
}
