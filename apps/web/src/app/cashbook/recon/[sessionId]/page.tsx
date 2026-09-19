import { ReconciliationWorkbench } from '@/components/reconciliation/reconciliation-workbench';
import { ReconciliationCompare } from '@/components/reconciliation/reconciliation-compare';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { canAccessFullErp } from '@/lib/entity-kind';
import { requireEntityTenant } from '@/lib/require-entity-shell';

export default async function CashbookReconSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { sessionId } = await params;
  const { view } = await searchParams;
  const tenant = await requireEntityTenant({
    requirePersonalShell: true,
    loginFrom: `/cashbook/recon/${sessionId}`,
  });
  const fullErp = canAccessFullErp(tenant.entityKind, tenant.capabilityTier);
  const classic = view === 'classic';

  return (
    <CashbookShell
      title={`${tenant.name} · Reconcile`}
      active="home"
      showFullErpLink={fullErp}
    >
      <div className="cashbook-import-page brw-workspace">
        {classic ? (
          <ReconciliationWorkbench
            sessionId={sessionId}
            inboxHref="/cashbook/bank-imports"
            createHref="/cashbook/bank-imports"
          />
        ) : (
          <ReconciliationCompare
            sessionId={sessionId}
            inboxHref="/cashbook/bank-imports"
            classicHref={`/cashbook/recon/${sessionId}?view=classic`}
          />
        )}
      </div>
    </CashbookShell>
  );
}
