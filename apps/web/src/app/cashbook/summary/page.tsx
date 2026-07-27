import { listCashbookRows, listYearDomainTotals } from '@/app/actions/cashbook';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { CashbookExportButton } from '@/components/cashbook/cashbook-export-button';
import { requireEntityTenant } from '@/lib/require-entity-shell';

function fmt(n: number) {
  return n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
    <CashbookShell title={`${tenant.name} · Summary`} active="summary">
      <h2 className="cashbook-section-title">This month · {period}</h2>
      <div className="cashbook-dual">
        <div className="cashbook-card">
          <span className="cashbook-card-label">Personal</span>
          <p>
            In {fmt(personalMonth.moneyIn)} · Out {fmt(personalMonth.moneyOut)}
          </p>
          <strong>Net {fmt(personalMonth.net)}</strong>
          <CashbookExportButton
            bookDomain="personal"
            period={period}
            label="CSV · personal month"
          />
        </div>
        {businessMonth ? (
          <div className="cashbook-card">
            <span className="cashbook-card-label">Business</span>
            <p>
              In {fmt(businessMonth.moneyIn)} · Out {fmt(businessMonth.moneyOut)}
            </p>
            <strong>Net {fmt(businessMonth.net)}</strong>
            {(businessMonth.receivables > 0 || businessMonth.payables > 0) && (
              <p className="muted" style={{ fontSize: 13 }}>
                Open AR {fmt(businessMonth.receivables)} · AP {fmt(businessMonth.payables)}
              </p>
            )}
            <CashbookExportButton
              bookDomain="business"
              period={period}
              label="CSV · business month"
            />
          </div>
        ) : null}
      </div>

      {tenant.entityKind === 'sole_prop' ? (
        <>
          <h2 className="cashbook-section-title">Year {year} · combined overview</h2>
          <div className="cashbook-dual">
            <div className="cashbook-card">
              <span className="cashbook-card-label">Personal year</span>
              <p>
                Income {fmt(yearTotals.personal.moneyIn)} · Expenses{' '}
                {fmt(yearTotals.personal.moneyOut)}
              </p>
              <strong>Net {fmt(yearTotals.personal.net)}</strong>
            </div>
            <div className="cashbook-card">
              <span className="cashbook-card-label">Business year</span>
              <p>
                Sales {fmt(yearTotals.business?.moneyIn ?? 0)} · Costs{' '}
                {fmt(yearTotals.business?.moneyOut ?? 0)}
              </p>
              <strong>Net {fmt(yearTotals.business?.net ?? 0)}</strong>
            </div>
          </div>
          <div className="cashbook-card cashbook-card-combined">
            <span className="cashbook-card-label">Combined (info v1)</span>
            <strong style={{ fontSize: 20 }}>Net {fmt(yearTotals.combinedNet)}</strong>
            <p className="onboard-lead" style={{ margin: '8px 0 0', fontSize: 13 }}>
              For IIT planning only — not a filed return. Tax packs (Phase 6) will expand schedules
              from these domain-tagged books.
            </p>
          </div>
        </>
      ) : (
        <>
          <h2 className="cashbook-section-title">Year {year}</h2>
          <div className="cashbook-card">
            <p>
              Income {fmt(yearTotals.personal.moneyIn)} · Expenses{' '}
              {fmt(yearTotals.personal.moneyOut)}
            </p>
            <strong>Net {fmt(yearTotals.personal.net)}</strong>
          </div>
        </>
      )}

      <p className="onboard-lead">
        Tax pack v0 = CSV of entries for your accountant. Full IRD e-filing is out of scope for now.
      </p>
    </CashbookShell>
  );
}
