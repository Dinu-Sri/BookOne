import { listCashbookRows, listYearDomainTotals } from '@/app/actions/cashbook';
import { CashbookSummaryClient } from '@/components/cashbook/cashbook-summary-client';
import { requireEntityTenant } from '@/lib/require-entity-shell';

export default async function CashbookSummaryPage() {
  const tenant = await requireEntityTenant({
    requirePersonalShell: true,
    loginFrom: '/cashbook/summary',
  });

  const period = new Date().toISOString().slice(0, 7);
  const year = new Date().getFullYear();
  const personalMonth = await listCashbookRows({ bookDomain: 'personal', period });
  const businessMonth =
    tenant.entityKind === 'sole_prop'
      ? await listCashbookRows({ bookDomain: 'business', period })
      : null;
  const yearTotals = await listYearDomainTotals({ year });

  return (
    <CashbookSummaryClient
      tenantName={tenant.name}
      period={period}
      year={year}
      entityKind={tenant.entityKind}
      personalMonth={{
        moneyIn: personalMonth.moneyIn,
        moneyOut: personalMonth.moneyOut,
        net: personalMonth.net,
      }}
      businessMonth={
        businessMonth
          ? {
              moneyIn: businessMonth.moneyIn,
              moneyOut: businessMonth.moneyOut,
              net: businessMonth.net,
              receivables: businessMonth.receivables,
              payables: businessMonth.payables,
            }
          : null
      }
      yearPersonal={{
        moneyIn: yearTotals.personal.moneyIn,
        moneyOut: yearTotals.personal.moneyOut,
        net: yearTotals.personal.net,
      }}
      yearBusiness={
        yearTotals.business
          ? {
              moneyIn: yearTotals.business.moneyIn,
              moneyOut: yearTotals.business.moneyOut,
              net: yearTotals.business.net,
            }
          : null
      }
      combinedNet={yearTotals.combinedNet}
    />
  );
}
