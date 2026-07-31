import { ReconciliationWorkbench } from '@/components/reconciliation/reconciliation-workbench';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { canAccessFullErp } from '@/lib/entity-kind';
import { requireEntityTenant } from '@/lib/require-entity-shell';

export default async function CashbookReconSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const tenant = await requireEntityTenant({
    requirePersonalShell: true,
    loginFrom: `/cashbook/recon/${sessionId}`,
  });
  const fullErp = canAccessFullErp(tenant.entityKind, tenant.capabilityTier);

  return (
    <CashbookShell
      title={`${tenant.name} · Reconcile`}
      active="home"
      showFullErpLink={fullErp}
    >
      <div className="cashbook-import-page brw-workspace">
        <ReconciliationWorkbench
          sessionId={sessionId}
          inboxHref="/cashbook/bank-imports"
          createHref="/cashbook/bank-imports"
        />
      </div>
    </CashbookShell>
  );
}
