import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { ReconciliationWorkbench } from '@/components/reconciliation/reconciliation-workbench';
import { ReconciliationCompare } from '@/components/reconciliation/reconciliation-compare';
import { BookOneShell } from '@/components/layout/bookone-shell';

export default async function ErpReconSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { sessionId } = await params;
  const { view } = await searchParams;
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }
  const classic = view === 'classic';

  return (
    <BookOneShell active="Reconciliation" tenant={tenant}>
      <div className="workspace brw-workspace">
        {classic ? (
          <ReconciliationWorkbench
            sessionId={sessionId}
            inboxHref="/reconciliation"
            createHref="/reconciliation"
          />
        ) : (
          <ReconciliationCompare
            sessionId={sessionId}
            inboxHref="/reconciliation"
            classicHref={`/reconciliation/session/${sessionId}?view=classic`}
          />
        )}
      </div>
    </BookOneShell>
  );
}
