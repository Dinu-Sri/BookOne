import { ReconciliationGuided } from '@/components/reconciliation/reconciliation-guided';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { canAccessFullErp } from '@/lib/entity-kind';
import { requireEntityTenant } from '@/lib/require-entity-shell';

export default async function CashbookReconGuidedPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const tenant = await requireEntityTenant({
    requirePersonalShell: true,
    loginFrom: `/cashbook/recon/${sessionId}/guided`,
  });
  const fullErp = canAccessFullErp(tenant.entityKind, tenant.capabilityTier);

  return (
    <CashbookShell
      title={`${tenant.name} · Fix one by one`}
      active="home"
      showFullErpLink={fullErp}
    >
      <div className="cashbook-import-page brw-workspace">
        <ReconciliationGuided
          sessionId={sessionId}
          workbenchHref={`/cashbook/recon/${sessionId}`}
          inboxHref="/cashbook/bank-imports"
        />
      </div>
    </CashbookShell>
  );
}
