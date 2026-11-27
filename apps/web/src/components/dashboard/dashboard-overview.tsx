import Link from 'next/link';
import type { ReactNode } from 'react';
import { AGING_BUCKETS, DASHBOARD_METRIC_IDS, type AgingBucket } from '@bookone/accounting';
import type { BusinessOverview, HeadlineMetric, Widget } from '@/app/actions/dashboard';
import { DashboardAttention } from '@/components/dashboard/dashboard-attention';
import { DashboardChartPanel } from '@/components/dashboard/dashboard-chart-panel';
import { DashboardControls } from '@/components/dashboard/dashboard-controls';
import { HBarChart, compactMoney } from '@/components/charts/simple-charts';

const BUCKET_LABEL: Record<AgingBucket, string> = {
  current: 'Current',
  d1_30: '1–30',
  d31_60: '31–60',
  d61_90: '61–90',
  d90_plus: '90+',
};

const METRIC_DOM_ID: Record<string, string> = {
  [DASHBOARD_METRIC_IDS.netSales]: 'net-sales',
  [DASHBOARD_METRIC_IDS.operatingResult]: 'operating-result',
  [DASHBOARD_METRIC_IDS.netCashMovement]: 'net-cash',
  [DASHBOARD_METRIC_IDS.cashAndBank]: 'cash-bank',
  [DASHBOARD_METRIC_IDS.receivables]: 'receivables',
  [DASHBOARD_METRIC_IDS.payables]: 'payables',
};

function WidgetState({
  widget,
  label,
  children,
}: {
  widget: Widget<unknown>;
  label: string;
  children: ReactNode;
}) {
  if (widget.status === 'error') {
    return (
      <p className="dash-widget-error" role="alert">
        Could not load {label}. {widget.error}{' '}
        <Link href="/dashboard">Retry</Link>
      </p>
    );
  }
  if (widget.status === 'unavailable') {
    return <p className="dash-widget-muted">{widget.error}</p>;
  }
  if (widget.status === 'empty' || !widget.data) {
    return <p className="dash-empty">No activity in selected period.</p>;
  }
  return <>{children}</>;
}

function Headline({
  metric,
  extra,
}: {
  metric: HeadlineMetric;
  extra?: ReactNode;
}) {
  return (
    <article className={`dash-metric tone-${metric.tone}`} data-metric={metric.id}>
      <p className="metric-label">{metric.label}</p>
      <p className="metric-value" title={metric.exact} id={METRIC_DOM_ID[metric.id]}>
        <Link href={metric.href}>{metric.display}</Link>
      </p>
      {metric.comparison ? <p className="dash-compare-label">{metric.comparison.label}</p> : null}
      <details className="dash-metric-details">
        <summary>Details</summary>
        <p>{metric.exact}</p>
        <p>{metric.note}</p>
        {extra}
      </details>
    </article>
  );
}

function AgingStrip({
  title,
  widget,
  currency,
}: {
  title: string;
  widget: BusinessOverview['ar'];
  currency: string;
}) {
  return (
    <div className="dash-aging-strip">
      <p className="dash-strip-title">{title}</p>
      <WidgetState widget={widget} label={title}>
        {widget.data ? (
          <>
            <p className="dash-strip-value">
              <Link href={widget.data.href}>
                {widget.data.overdueAmount.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                overdue
              </Link>
              <span>
                {' '}
                of {widget.data.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currency}
              </span>
            </p>
            <ol className="dash-aging-segments">
              {AGING_BUCKETS.map((bucket) => {
                const amount = widget.data!.amounts[bucket];
                const max = Math.max(widget.data!.grandTotal, 0.01);
                return (
                  <li key={bucket} className={`is-${bucket}`} title={`${BUCKET_LABEL[bucket]} ${amount.toFixed(2)}`}>
                    <i style={{ height: `${Math.min(100, (Math.abs(amount) / max) * 100)}%` }} />
                    <span>{BUCKET_LABEL[bucket]}</span>
                  </li>
                );
              })}
            </ol>
            <p>
              <Link href={widget.data.href}>View all {title.toLowerCase()}</Link>
            </p>
          </>
        ) : null}
      </WidgetState>
    </div>
  );
}

export function DashboardOverview({ overview }: { overview: BusinessOverview }) {
  const periodDates =
    overview.periodFrom && overview.periodTo ? `${overview.periodFrom} to ${overview.periodTo}` : overview.periodLabel;
  const cash = overview.cash.data;
  const cashExtra = cash
    ? `Funding in ${cash.fundingIn.toLocaleString('en-US', { minimumFractionDigits: 2 })} · funding/drawings out ${cash.fundingOut.toLocaleString('en-US', { minimumFractionDigits: 2 })} · internal transfers ${cash.transferIn.toLocaleString('en-US', { minimumFractionDigits: 2 })} excluded from received/paid`
    : undefined;
  const cashSummary = cash
    ? `Received ${cash.moneyIn.toLocaleString('en-US', { minimumFractionDigits: 2 })} · paid ${cash.moneyOut.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : undefined;

  return (
    <div className="workspace dash-page" id="dashboard">
      <header className="dash-header">
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">
            <span id="company">{overview.companyName}</span>
            {' · '}
            {overview.periodLabel}
            {periodDates ? ` · ${periodDates}` : ''}
            {' · as of '}
            {overview.asOf} ({overview.timezone}) · {overview.currency}
          </p>
        </div>
        <DashboardControls compare={overview.compare} generatedAt={overview.generatedAt} />
      </header>

      <div className="dash-kpis">
        <section className="dash-group" aria-labelledby="dash-period">
          <h2 id="dash-period" className="dash-group-title">
            Selected period
          </h2>
          <div className="dash-kpi-row">
            {overview.headlines.period.map((m) => (
              <Headline key={m.id} metric={m} />
            ))}
          </div>
        </section>
        <section className="dash-group" aria-labelledby="dash-position">
          <h2 id="dash-position" className="dash-group-title">
            As of range end
          </h2>
          <div className="dash-kpi-row">
            {overview.headlines.position.map((m) => (
              <Headline
                key={m.id}
                metric={m}
                extra={
                  m.id === DASHBOARD_METRIC_IDS.cashAndBank ? (
                    <p id="card-clearing">
                      Card clearing {overview.cardClearing.display} — {overview.cardClearing.note}
                    </p>
                  ) : null
                }
              />
            ))}
          </div>
        </section>
      </div>

      <div className="grid dash-charts dash-charts-3">
        <WidgetState widget={overview.sales} label="sales trend">
          {overview.sales.data ? (
            <DashboardChartPanel
              title="Sales trend"
              mode="sales"
              points={overview.sales.data.series}
              tableId="sales-table"
              viewDataId="sales-view-data"
            />
          ) : null}
        </WidgetState>
        <WidgetState widget={overview.cash} label="cash movement">
          {overview.cash.data ? (
            <DashboardChartPanel
              title="Cash received and paid"
              mode="cash"
              points={overview.cash.data.series}
              summary={cashSummary}
              extra={cashExtra}
              tableId="cash-table"
              viewDataId="cash-view-data"
            />
          ) : null}
        </WidgetState>
        <section className="card dash-chart-card dash-expenses" aria-labelledby="dash-expenses-title">
          <div className="card-header dash-chart-head">
            <h2 className="card-title" id="dash-expenses-title">
              Where the money went
            </h2>
            <Link href="/reports?report=pnl" className="button secondary">
              Profit or loss
            </Link>
          </div>
          <div className="card-body">
            <WidgetState widget={overview.expenses} label="expenses">
              {overview.expenses.data && overview.expenses.data.items.length ? (
                <>
                  <HBarChart
                    title="Biggest costs this period"
                    bars={overview.expenses.data.items.slice(0, 6).map((e, i) => ({
                      label: e.name,
                      value: e.amount,
                      tone: i === 0 ? 'danger' : 'brand',
                    }))}
                  />
                  <p className="dash-expense-total">
                    Total costs {compactMoney(overview.expenses.data.total)} {overview.currency}
                    {overview.expenses.data.items.length > 6 ? ` · top 6 of ${overview.expenses.data.items.length}` : ''}
                  </p>
                </>
              ) : (
                <p className="dash-empty">No activity in selected period.</p>
              )}
            </WidgetState>
          </div>
        </section>
      </div>

      <section className="dash-summary" aria-label="Balances and exceptions">
        {overview.modules.sales ? (
          <AgingStrip title="Customer overdue" widget={overview.ar} currency={overview.currency} />
        ) : null}
        {overview.modules.purchase ? (
          <AgingStrip title="Supplier due" widget={overview.ap} currency={overview.currency} />
        ) : null}
        <div className="dash-aging-strip">
          <p className="dash-strip-title">Exceptions</p>
          <WidgetState widget={overview.attention} label="attention items">
            <DashboardAttention items={overview.attention.data ?? []} />
          </WidgetState>
        </div>
      </section>
    </div>
  );
}
