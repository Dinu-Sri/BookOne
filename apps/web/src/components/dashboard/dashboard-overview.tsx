import Link from 'next/link';
import type { ReactNode } from 'react';
import { AGING_BUCKETS, type AgingBucket } from '@bookone/accounting';
import type { BusinessOverview, HeadlineMetric, Widget } from '@/app/actions/dashboard';
import { DashboardControls } from '@/components/dashboard/dashboard-controls';
import { Badge, Card } from '@/components/ui/bookone-ui';

const BUCKET_LABEL: Record<AgingBucket, string> = {
  current: 'Current',
  d1_30: '1–30',
  d31_60: '31–60',
  d61_90: '61–90',
  d90_plus: '90+',
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
    return <p className="dash-widget-muted">No {label.toLowerCase()} in this range.</p>;
  }
  return <>{children}</>;
}

function Headline({ metric }: { metric: HeadlineMetric }) {
  return (
    <article className={`dash-metric tone-${metric.tone}`}>
      <p className="metric-label">{metric.label}</p>
      <p className="metric-value" title={metric.exact}>
        <Link href={metric.href}>{metric.display}</Link>
      </p>
      <p className="metric-note">{metric.note}</p>
      {metric.comparison ? <p className="dash-compare-label">{metric.comparison.label}</p> : null}
    </article>
  );
}

function BarPair({
  inValue,
  outValue,
  inLabel,
  outLabel,
}: {
  inValue: number;
  outValue: number;
  inLabel: string;
  outLabel: string;
}) {
  const max = Math.max(Math.abs(inValue), Math.abs(outValue), 0.01);
  const inPct = Math.min(100, (Math.abs(inValue) / max) * 100);
  const outPct = Math.min(100, (Math.abs(outValue) / max) * 100);
  return (
    <div className="dash-bar-pair">
      <div>
        <span>{inLabel}</span>
        <div className="cashflow-track" aria-hidden>
          <i style={{ width: `${inPct}%` }} />
        </div>
      </div>
      <div>
        <span>{outLabel}</span>
        <div className="cashflow-track out" aria-hidden>
          <i style={{ width: `${outPct}%` }} />
        </div>
      </div>
    </div>
  );
}

function SeriesChart({
  points,
  mode,
}: {
  points: Array<{ key: string; label: string; value?: number; moneyIn?: number; moneyOut?: number; previous?: number | null }>;
  mode: 'sales' | 'cash';
}) {
  const width = 640;
  const height = 180;
  const pad = { l: 8, r: 8, t: 12, b: 28 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(
    0.01,
    ...points.map((p) =>
      mode === 'cash'
        ? Math.max(Math.abs(p.moneyIn ?? 0), Math.abs(p.moneyOut ?? 0), Math.abs(p.previous ?? 0))
        : Math.max(Math.abs(p.value ?? 0), Math.abs(p.previous ?? 0)),
    ),
  );
  const n = Math.max(points.length, 1);
  const gap = 4;
  const slot = innerW / n;
  const barW = Math.max(2, slot - gap);

  return (
    <div className="dash-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
        <line x1={pad.l} x2={width - pad.r} y1={pad.t + innerH} y2={pad.t + innerH} stroke="currentColor" opacity="0.2" />
        {points.map((p, i) => {
          const x = pad.l + i * slot + gap / 2;
          if (mode === 'cash') {
            const inH = ((p.moneyIn ?? 0) / max) * (innerH - 4);
            const outH = ((p.moneyOut ?? 0) / max) * (innerH - 4);
            const half = Math.max(1, barW / 2 - 1);
            return (
              <g key={p.key}>
                <rect x={x} y={pad.t + innerH - inH} width={half} height={inH} fill="var(--success)" rx="1" />
                <rect x={x + half + 1} y={pad.t + innerH - outH} width={half} height={outH} fill="var(--danger)" rx="1" />
              </g>
            );
          }
          const h = (Math.abs(p.value ?? 0) / max) * (innerH - 4);
          const y = (p.value ?? 0) < 0 ? pad.t + innerH : pad.t + innerH - h;
          return <rect key={p.key} x={x} y={y} width={barW} height={h} fill="var(--brand)" rx="1" />;
        })}
      </svg>
      <table className="dash-chart-table">
        <caption className="sr-only">{mode === 'sales' ? 'Sales by period' : 'Cash received and paid'}</caption>
        <thead>
          <tr>
            <th scope="col">Bucket</th>
            {mode === 'sales' ? <th scope="col">Net sales</th> : (
              <>
                <th scope="col">Received</th>
                <th scope="col">Paid</th>
              </>
            )}
            <th scope="col">Previous</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{p.label}</th>
              {mode === 'sales' ? <td>{p.value ?? 0}</td> : (
                <>
                  <td>{p.moneyIn ?? 0}</td>
                  <td>{p.moneyOut ?? 0}</td>
                </>
              )}
              <td>{p.previous ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgingPanel({
  title,
  widget,
  currencyNote,
}: {
  title: string;
  widget: BusinessOverview['ar'];
  currencyNote: string;
}) {
  return (
    <Card>
      <div className="card-header">
        <div>
          <p className="eyebrow">{title}</p>
          <h2 className="card-title" style={{ marginTop: 4 }}>Aging at cutoff</h2>
        </div>
      </div>
      <div className="card-body">
        <WidgetState widget={widget} label={title}>
          {widget.data ? (
            <>
              <ul className="dash-aging">
                {AGING_BUCKETS.map((bucket) => {
                  const amount = widget.data!.amounts[bucket];
                  const count = widget.data!.counts[bucket];
                  const max = Math.max(widget.data!.grandTotal, 0.01);
                  return (
                    <li key={bucket}>
                      <Link href={`${widget.data!.href}&bucket=${bucket}`}>
                        <span>{BUCKET_LABEL[bucket]}</span>
                        <strong>{amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                        <em>{count} doc{count === 1 ? '' : 's'}</em>
                      </Link>
                      <div className="dash-aging-track" aria-hidden>
                        <i style={{ width: `${Math.min(100, (Math.abs(amount) / max) * 100)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="dash-recon">
                Documents {widget.data.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} · control {widget.data.controlBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} · difference {widget.data.difference.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyNote}
              </p>
              <p>
                <Link href={widget.data.href}>Open {title.toLowerCase()}</Link>
              </p>
            </>
          ) : null}
        </WidgetState>
      </div>
    </Card>
  );
}

export function DashboardOverview({ overview }: { overview: BusinessOverview }) {
  return (
    <div className="workspace dash-page">
      <header className="dash-header">
        <div>
          <p className="eyebrow">Business overview</p>
          <h1 className="h1">{overview.companyName}</h1>
          <p className="lead">
            {overview.periodLabel}
            {overview.periodFrom && overview.periodTo ? ` · ${overview.periodFrom} to ${overview.periodTo}` : ''}
            {' · '}
            Positions as of {overview.asOf} ({overview.timezone})
          </p>
        </div>
        <DashboardControls compare={overview.compare} generatedAt={overview.generatedAt} />
      </header>

      <section className="dash-group" aria-labelledby="dash-period">
        <h2 id="dash-period" className="dash-group-title">Selected period</h2>
        <div className="grid metrics dash-metrics-3">
          {overview.headlines.period.map((m) => (
            <Headline key={m.id} metric={m} />
          ))}
        </div>
      </section>

      <section className="dash-group" aria-labelledby="dash-position">
        <h2 id="dash-position" className="dash-group-title">As of range end</h2>
        <div className="grid metrics dash-metrics-3">
          {overview.headlines.position.map((m) => (
            <Headline key={m.id} metric={m} />
          ))}
        </div>
        <p className="dash-clearing">
          Card clearing {overview.cardClearing.display} — {overview.cardClearing.note}
        </p>
      </section>

      <div className="grid two dash-charts">
        <Card>
          <div className="card-header">
            <div>
              <p className="eyebrow">Sales</p>
              <h2 className="card-title" style={{ marginTop: 4 }}>Net sales trend</h2>
            </div>
            {overview.compare && overview.compareLabel ? <Badge tone="info">{overview.compareLabel}</Badge> : null}
          </div>
          <div className="card-body">
            <WidgetState widget={overview.sales} label="sales trend">
              {overview.sales.data ? <SeriesChart points={overview.sales.data.series} mode="sales" /> : null}
            </WidgetState>
          </div>
        </Card>
        <Card>
          <div className="card-header">
            <div>
              <p className="eyebrow">Cash</p>
              <h2 className="card-title" style={{ marginTop: 4 }}>Received and paid</h2>
            </div>
          </div>
          <div className="card-body">
            <WidgetState widget={overview.cash} label="cash movement">
              {overview.cash.data ? (
                <>
                  <BarPair
                    inValue={overview.cash.data.moneyIn}
                    outValue={overview.cash.data.moneyOut}
                    inLabel={`Received ${overview.cash.data.moneyIn.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                    outLabel={`Paid ${overview.cash.data.moneyOut.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  />
                  <SeriesChart points={overview.cash.data.series} mode="cash" />
                  <p className="dash-recon">
                    Funding in {overview.cash.data.fundingIn.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    {' · '}funding/drawings out {overview.cash.data.fundingOut.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    {' · '}internal transfers {overview.cash.data.transferIn.toLocaleString('en-US', { minimumFractionDigits: 2 })} excluded from received/paid
                  </p>
                </>
              ) : null}
            </WidgetState>
          </div>
        </Card>
      </div>

      <div className="grid two dash-aging-row">
        {overview.modules.sales ? <AgingPanel title="Receivables" widget={overview.ar} currencyNote={overview.currency} /> : null}
        {overview.modules.purchase ? <AgingPanel title="Payables" widget={overview.ap} currencyNote={overview.currency} /> : null}
      </div>

      <div className="grid two dash-lower">
        <Card>
          <div className="card-header">
            <div>
              <p className="eyebrow">Attention</p>
              <h2 className="card-title" style={{ marginTop: 4 }}>What needs work</h2>
            </div>
          </div>
          <div className="card-body">
            <WidgetState widget={overview.attention} label="attention items">
              {overview.attention.data && overview.attention.data.length === 0 ? (
                <p className="dash-widget-muted">Nothing flagged in this view.</p>
              ) : (
                <ul className="dash-attention">
                  {overview.attention.data?.map((item) => (
                    <li key={item.id}>
                      <Link href={item.href}>
                        <strong>{item.label}</strong>
                        <span>
                          {item.count}
                          {item.amountDisplay ? ` · ${item.amountDisplay}` : ''}
                        </span>
                      </Link>
                      <small>
                        {item.freshness === 'current' ? 'Current' : item.freshness === 'cutoff' ? 'As of cutoff' : 'Selected period'} · {item.note}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </WidgetState>
          </div>
        </Card>
        <Card>
          <div className="card-header">
            <div>
              <p className="eyebrow">Expenses</p>
              <h2 className="card-title" style={{ marginTop: 4 }}>Largest categories</h2>
            </div>
          </div>
          <div className="card-body">
            <WidgetState widget={overview.expenses} label="expenses">
              {overview.expenses.data ? (
                <ul className="dash-expenses">
                  {overview.expenses.data.items.map((item) => {
                    const max = Math.max(overview.expenses.data!.total, 0.01);
                    return (
                      <li key={item.code}>
                        <span>{item.name}</span>
                        <strong>{item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                        <div className="dash-aging-track" aria-hidden>
                          <i style={{ width: `${Math.min(100, (item.amount / max) * 100)}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </WidgetState>
            <p>
              <Link href={`/reports?period=${overview.periodToken}`}>Open profit and loss</Link>
            </p>
          </div>
        </Card>
      </div>

      <section className="dash-modules" aria-label="Module views">
        {overview.modules.sales ? (
          <Link className="dash-module-link" href={`/sales/invoices?period=${overview.periodToken}`}>Sales invoices</Link>
        ) : null}
        {overview.modules.sales ? (
          <Link className="dash-module-link" href={`/sales/payments?period=${overview.periodToken}`}>Cash and collections</Link>
        ) : null}
        {overview.modules.inventory ? (
          <Link className="dash-module-link" href="/inventory/levels">Inventory and operations</Link>
        ) : null}
        <Link className="dash-module-link" href={`/reports?period=${overview.periodToken}`}>Accounting reports</Link>
      </section>
      <p className="dash-deferred">
        Deferred: {overview.deferred.join(' ')}
      </p>
    </div>
  );
}
