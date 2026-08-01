import { redirect } from 'next/navigation';
import { getReconciliationReportData } from '@/app/actions/bank-reconciliation';
import { ReconciliationReportView } from '@/components/reconciliation/reconciliation-report';
import { requireEntityTenant } from '@/lib/require-entity-shell';

export default async function CashbookReconReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  try {
    await requireEntityTenant({
      requirePersonalShell: true,
      loginFrom: `/cashbook/recon/${sessionId}/report`,
    });
  } catch {
    redirect('/login');
  }

  const res = await getReconciliationReportData(sessionId);
  if (!res.ok) {
    return (
      <div className="brp-root">
        <p>{res.error}</p>
        <a href={`/cashbook/recon/${sessionId}`}>← Back</a>
      </div>
    );
  }

  return (
    <ReconciliationReportView
      data={res.data}
      backHref={`/cashbook/recon/${sessionId}`}
    />
  );
}
