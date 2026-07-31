import Link from 'next/link';
import { listReconciliationSessions } from '@/app/actions/bank-reconciliation';
import { ReconciliationInbox } from '@/components/reconciliation/reconciliation-inbox';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { canAccessFullErp } from '@/lib/entity-kind';
import { requireEntityTenant } from '@/lib/require-entity-shell';

/**
 * Cashbook Bank reconciliation inbox (same sessions as full ERP).
 */
export default async function CashbookBankImportsPage() {
  const tenant = await requireEntityTenant({
    requirePersonalShell: true,
    loginFrom: '/cashbook/bank-imports',
  });

  const fullErp = canAccessFullErp(tenant.entityKind, tenant.capabilityTier);
  let sessions: Awaited<ReturnType<typeof listReconciliationSessions>> = [];
  try {
    sessions = await listReconciliationSessions();
  } catch {
    sessions = [];
  }

  return (
    <CashbookShell
      title={`${tenant.name} · Bank reconciliation`}
      active="home"
      showFullErpLink={fullErp}
    >
      <div className="cashbook-import-page">
        <div className="cashbook-import-head">
          <h1 className="cashbook-import-title">Bank reconciliation</h1>
          <Link href="/cashbook" className="cashbook-import-back">
            ← Cashbook
          </Link>
        </div>
        <p className="bih-lead">
          Each card is a bank account and statement period. Import files are attached as evidence —
          match them to cashbook entries here.
        </p>
        <ReconciliationInbox
          sessions={sessions}
          importHref="/cashbook/import"
          sessionBase="/cashbook/recon"
        />
      </div>
    </CashbookShell>
  );
}
