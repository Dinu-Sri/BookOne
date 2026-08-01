import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { ReconciliationGuided } from '@/components/reconciliation/reconciliation-guided';
import { BookOneShell } from '@/components/layout/bookone-shell';

export default async function ErpReconGuidedPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Reconciliation" tenant={tenant}>
      <div className="workspace brw-workspace">
        <ReconciliationGuided
          sessionId={sessionId}
          workbenchHref={`/reconciliation/session/${sessionId}`}
          inboxHref="/reconciliation"
        />
      </div>
    </BookOneShell>
  );
}
