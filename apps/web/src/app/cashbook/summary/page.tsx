import { listCashbookRows } from '@/app/actions/cashbook';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { CashbookExportButton } from '@/components/cashbook/cashbook-export-button';
import { requireEntityTenant } from '@/lib/require-entity-shell';

export default async function CashbookSummaryPage() {
  const tenant = await requireEntityTenant({
    requirePersonalShell: true,
    loginFrom: '/cashbook/summary',
  });

  const period = new Date().toISOString().slice(0, 7);
  const personal = await listCashbookRows({ bookDomain: 'personal', period });
  const business =
    tenant.entityKind === 'sole_prop'
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
          <CashbookExportButton
            bookDomain="personal"
            period={period}
            label="Download personal CSV"
          />
        </div>
        {business ? (
          <div>
            <span>Business · {period}</span>
            <p>
              In {business.moneyIn.toFixed(2)} · Out {business.moneyOut.toFixed(2)} · Net{' '}
              <strong>{business.net.toFixed(2)}</strong>
            </p>
            <CashbookExportButton
              bookDomain="business"
              period={period}
              label="Download business CSV"
            />
          </div>
        ) : null}
      </div>
      <p className="onboard-lead">
        Tax pack v0 is a CSV of this month&apos;s entries for your accountant. Year packs and IIT
        schedules come later — your books stay double-entry underneath.
      </p>
    </CashbookShell>
  );
}
