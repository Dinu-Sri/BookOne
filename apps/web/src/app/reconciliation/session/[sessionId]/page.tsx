import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { ReconciliationWorkbench } from '@/components/reconciliation/reconciliation-workbench';
import { BookOneShell } from '@/components/layout/bookone-shell';

export default async function ErpReconSessionPage({
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
        <ReconciliationWorkbench
          sessionId={sessionId}
          inboxHref="/reconciliation"
          createHref="/reconciliation"
        />
      </div>
    </BookOneShell>
  );
}
