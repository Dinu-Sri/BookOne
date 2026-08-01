import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { getReconciliationReportData } from '@/app/actions/bank-reconciliation';
import { ReconciliationReportView } from '@/components/reconciliation/reconciliation-report';

export default async function ErpReconReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  try {
    await getTenantInfo();
  } catch {
    redirect('/login');
  }

  const res = await getReconciliationReportData(sessionId);
  if (!res.ok) {
    return (
      <div className="brp-root">
        <p>{res.error}</p>
        <a href={`/reconciliation/session/${sessionId}`}>← Back</a>
      </div>
    );
  }

  return (
    <ReconciliationReportView
      data={res.data}
      backHref={`/reconciliation/session/${sessionId}`}
    />
  );
}
