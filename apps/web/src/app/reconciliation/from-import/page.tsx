import { redirect } from 'next/navigation';
import { resolveImportToSession } from '@/app/actions/bank-reconciliation';
import { getTenantInfo } from '@/app/actions/workspace';

/** ERP compat: importId → session workbench */
export default async function ErpFromImportPage({
  searchParams,
}: {
  searchParams?: Promise<{ importId?: string }> | { importId?: string };
}) {
  try {
    await getTenantInfo();
  } catch {
    redirect('/login');
  }
  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const importId = params?.importId;
  if (!importId) redirect('/reconciliation');
  const res = await resolveImportToSession(importId);
  if (!res.ok) redirect('/reconciliation');
  redirect(`/reconciliation/session/${res.sessionId}`);
}
