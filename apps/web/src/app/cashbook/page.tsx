import { listCashbookRows } from '@/app/actions/cashbook';
import { CashbookHomeClient } from '@/components/cashbook/cashbook-home';
import type { BookDomain } from '@/lib/entity-kind';
import { requireEntityTenant } from '@/lib/require-entity-shell';

export default async function CashbookPage({
  searchParams,
}: {
  searchParams?: { domain?: string; period?: string };
}) {
  const tenant = await requireEntityTenant({
    requirePersonalShell: true,
    loginFrom: '/cashbook',
  });

  const domainParam = searchParams?.domain;
  const bookDomain: BookDomain | null =
    domainParam === 'personal' || domainParam === 'business' ? domainParam : null;
  const period = searchParams?.period ?? new Date().toISOString().slice(0, 7);

  const data = await listCashbookRows({ bookDomain, period });

  return (
    <CashbookHomeClient
      entityKind={tenant.entityKind}
      capabilityTier={tenant.capabilityTier}
      tenantName={tenant.name}
      initialRows={data.rows}
      moneyIn={data.moneyIn}
      moneyOut={data.moneyOut}
      net={data.net}
      period={period}
      receivables={data.receivables}
      payables={data.payables}
    />
  );
}
