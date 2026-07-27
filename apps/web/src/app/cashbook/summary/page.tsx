import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { listCashbookRows } from '@/app/actions/cashbook';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { parseEntityKind, usesPersonalShell, needsOnboarding } from '@/lib/entity-kind';

export default async function CashbookSummaryPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login?from=/cashbook/summary');
  }
  const entityKind = parseEntityKind(tenant.entityKind);
  if (needsOnboarding(entityKind)) redirect('/onboarding');
  if (!usesPersonalShell(entityKind)) redirect('/reports');

  const period = new Date().toISOString().slice(0, 7);
  const personal = await listCashbookRows({ bookDomain: 'personal', period });
  const business =
    entityKind === 'sole_prop'
      ? await listCashbookRows({ bookDomain: 'business', period })
      : null;

  return (
    <CashbookShell title={`${tenant.name} · Summary`} active="summary">
      <div className="cashbook-summary" style={{ gridTemplateColumns: '1fr' }}>
        <div>
          <span>Personal · {period}</span>
          <p>
            In {personal.moneyIn.toFixed(2)} · Out {personal.moneyOut.toFixed(2)} · Net{' '}
            <strong>{personal.net.toFixed(2)}</strong>
          </p>
        </div>
        {business ? (
          <div>
            <span>Business · {period}</span>
            <p>
              In {business.moneyIn.toFixed(2)} · Out {business.moneyOut.toFixed(2)} · Net{' '}
              <strong>{business.net.toFixed(2)}</strong>
            </p>
          </div>
        ) : null}
      </div>
      <p className="onboard-lead">
        Year tax pack and combined IIT view will expand here. For now this is your month snapshot.
      </p>
    </CashbookShell>
  );
}
