import { redirect } from 'next/navigation';

/** Alias → final studio lives at /cashbook/import */
export default async function CashbookImportStudioAliasPage({
  searchParams,
}: {
  searchParams?: { domain?: string; draft?: string };
}) {
  const q = new URLSearchParams();
  if (searchParams?.domain) q.set('domain', searchParams.domain);
  if (searchParams?.draft) q.set('draft', searchParams.draft);
  const qs = q.toString();
  redirect(qs ? `/cashbook/import?${qs}` : '/cashbook/import');
}
