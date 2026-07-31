import { redirect } from 'next/navigation';
import { resolveImportToSession } from '@/app/actions/bank-reconciliation';
import { requireEntityTenant } from '@/lib/require-entity-shell';

/**
 * Compatibility: old match?importId= URLs → recon session workbench.
 */
export default async function CashbookMatchCompatPage({
  searchParams,
}: {
  searchParams?: Promise<{ importId?: string }> | { importId?: string };
}) {
  await requireEntityTenant({
    requirePersonalShell: true,
    loginFrom: '/cashbook/match',
  });

  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const importId = params?.importId;

  if (!importId) {
    redirect('/cashbook/bank-imports');
  }

  const res = await resolveImportToSession(importId);
  if (!res.ok) {
    redirect('/cashbook/bank-imports');
  }
  redirect(`/cashbook/recon/${res.sessionId}`);
}
