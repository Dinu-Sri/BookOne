import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { listCashbookRows } from '@/app/actions/cashbook';
import { CashbookHomeClient } from '@/components/cashbook/cashbook-home';
import { needsOnboarding, parseEntityKind, usesPersonalShell } from '@/lib/entity-kind';
import type { BookDomain } from '@/lib/entity-kind';

export default async function CashbookPage({
  searchParams,
}: {
  searchParams?: { domain?: string; period?: string };
}) {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login?from=/cashbook');
  }

  const entityKind = parseEntityKind(tenant.entityKind);
  if (needsOnboarding(entityKind)) redirect('/onboarding');
  if (!usesPersonalShell(entityKind)) redirect('/');

  const domainParam = searchParams?.domain;
  const bookDomain: BookDomain | null =
    domainParam === 'personal' || domainParam === 'business' ? domainParam : null;
  const period = searchParams?.period ?? new Date().toISOString().slice(0, 7);

  const data = await listCashbookRows({ bookDomain, period });

  return (
    <CashbookHomeClient
      entityKind={entityKind}
      tenantName={tenant.name}
      initialRows={data.rows}
      moneyIn={data.moneyIn}
      moneyOut={data.moneyOut}
      net={data.net}
      period={period}
    />
  );
}
