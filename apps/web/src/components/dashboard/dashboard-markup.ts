import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  AGING_BUCKETS,
  DB01_AS_OF,
  DB01_CURRENCY,
  DB01_PERIOD,
  cashSeries,
  cashUniverseFromRows,
  composeDashboardMetrics,
  formatCompanyMoney,
  independentExpected,
  rowsFromLines,
  salesSeries,
  db01AsOfLines,
  db01OpeningLines,
  db01PeriodLines,
  DB01_AR_DOCUMENTS,
  DB01_AP_DOCUMENTS,
} from '@bookone/accounting';

export function db01OverviewModel() {
  const expected = independentExpected();
  const opening = cashUniverseFromRows(rowsFromLines(db01OpeningLines()));
  const snapshot = composeDashboardMetrics({
    periodLines: db01PeriodLines(),
    asOfLines: db01AsOfLines(),
    openingCashUniverse: opening,
    arDocuments: DB01_AR_DOCUMENTS,
    apDocuments: DB01_AP_DOCUMENTS,
    asOf: DB01_AS_OF,
  });
  const money = (n: number) => formatCompanyMoney(n, DB01_CURRENCY);
  const sales = salesSeries(db01PeriodLines(), DB01_PERIOD.from, DB01_PERIOD.to, 'day');
  const cash = cashSeries(db01PeriodLines(), DB01_PERIOD.from, DB01_PERIOD.to, 'day');
  const maxCash = Math.max(0.01, ...cash.map((p) => Math.max(p.moneyIn, p.moneyOut)));
  return { expected, snapshot, money, sales, cash, maxCash };
}

function shell(inner: string, opts?: { longLabel?: boolean; collapsedSidebar?: boolean; company?: string }) {
  const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');
  const company =
    opts?.company ??
    (opts?.longLabel
      ? 'DB01 Fixture Trading Company With A Very Long Registered Name For Layout'
      : 'DB01 Fixture Co');
  const collapsed = opts?.collapsedSidebar ? ' is-collapsed' : '';
  return `<!doctype html>
<html class="light" lang="en">
<head><meta charset="utf-8"><style>${css}</style></head>
<body>
<div class="app-shell${collapsed}" id="shell">
  <aside class="sidebar" aria-label="BookOne workspace sidebar">
    <div class="sidebar-header"><strong>BookOne</strong></div>
    <div class="sidebar-section suite-nav">
      <nav aria-label="Suite navigation">
        <div class="suite-group open">
          <button class="suite-trigger active" type="button" aria-expanded="true">ACCOUNTING</button>
          <div class="suite-panel" id="panel">
            <div class="suite-panel-inner">
              <div class="nav-list">
                <a class="nav-item nav-child active" href="/dashboard"><span class="nav-item-text"><span class="nav-item-label">Dashboard</span></span></a>
                <a class="nav-item nav-child" href="/reports"><span class="nav-item-text"><span class="nav-item-label">Reports</span></span></a>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </div>
  </aside>
  <main class="main">
    <header class="topbar">
      <div class="cluster"><span>${company}</span></div>
      <div class="topbar-actions"><span>Month to date</span></div>
    </header>
    ${inner}
  </main>
</div>
</body></html>`;
}

export function dashboardDb01Html(opts?: { longLabel?: boolean; collapsedSidebar?: boolean }) {
  const { expected, snapshot, money, sales, cash, maxCash } = db01OverviewModel();
  const company = opts?.longLabel
    ? 'DB01 Fixture Trading Company With A Very Long Registered Name For Layout'
    : 'DB01 Fixture Co';
  const salesMax = Math.max(0.01, ...sales.map((s) => Math.abs(s.value)));
  const salesBars = sales
    .map((p, i) => {
      const h = (Math.abs(p.value) / salesMax) * 180;
      const y = p.value < 0 ? 200 : 200 - h;
      return `<rect x="${i * 40 + 48}" y="${y}" width="28" height="${h}" fill="#1677c9"></rect>`;
    })
    .join('');
  const cashBars = cash
    .map((p, i) => {
      const inH = (p.moneyIn / maxCash) * 180;
      const outH = (p.moneyOut / maxCash) * 180;
      return `<g>
        <rect data-cash-in="${p.key}" x="${i * 40 + 46}" y="${200 - inH}" width="14" height="${inH}" fill="#15835f"></rect>
        <rect data-cash-out="${p.key}" x="${i * 40 + 62}" y="${200 - outH}" width="14" height="${outH}" fill="#c94141"></rect>
      </g>`;
    })
    .join('');
  const salesRows = sales.map((p) => `<tr><th>${p.label}</th><td>${p.value}</td></tr>`).join('');
  const cashRows = cash
    .map((p) => `<tr><th>${p.label}</th><td>${p.moneyIn}</td><td>${p.moneyOut}</td></tr>`)
    .join('');
  const bucketLabel: Record<string, string> = {
    current: 'Current',
    d1_30: '1–30',
    d31_60: '31–60',
    d61_90: '61–90',
    d90_plus: '90+',
  };
  const agingSegments = (aging: typeof snapshot.arAging) =>
    AGING_BUCKETS.map((bucket) => {
      const amount = aging.amounts[bucket];
      const max = Math.max(aging.grandTotal, 0.01);
      const h = Math.min(100, (Math.abs(amount) / max) * 100);
      return `<li class="is-${bucket}" title="${bucketLabel[bucket]} ${amount.toFixed(2)}"><i style="height:${h}%"></i><span>${bucketLabel[bucket]}</span></li>`;
    }).join('');

  const inner = `
    <div class="workspace dash-page" id="dashboard">
      <header class="dash-header">
        <div>
          <h1 class="dash-title">Dashboard</h1>
          <p class="dash-subtitle"><span id="company">${company}</span> · Month to date · ${DB01_PERIOD.from} to ${DB01_PERIOD.to} · as of ${DB01_AS_OF} (Asia/Colombo) · ${DB01_CURRENCY}</p>
        </div>
        <div class="dash-controls">
          <label class="dash-compare"><input type="checkbox" checked /> Compare previous</label>
          <p class="dash-stamp">Figures as of this load · 19 Mar 2026, 12:00</p>
          <button type="button" class="button secondary" id="refresh">Refresh</button>
        </div>
      </header>
      <div class="dash-kpis">
        <section class="dash-group" aria-labelledby="dash-period">
          <h2 id="dash-period" class="dash-group-title">Selected period</h2>
          <div class="dash-kpi-row">
            <article class="dash-metric" data-metric="DB01-NS"><p class="metric-label">Net sales</p><p class="metric-value" id="net-sales">${money(snapshot.netSales)}</p><p class="dash-compare-label">vs previous period</p><details class="dash-metric-details"><summary>Details</summary><p>${money(snapshot.netSales)}</p></details></article>
            <article class="dash-metric" data-metric="DB01-OR"><p class="metric-label">Operating result</p><p class="metric-value" id="operating-result">${money(snapshot.operatingResult)}</p><p class="dash-compare-label">vs previous period</p><details class="dash-metric-details"><summary>Details</summary><p>${money(snapshot.operatingResult)}</p></details></article>
            <article class="dash-metric" data-metric="DB01-NCM"><p class="metric-label">Net cash movement</p><p class="metric-value" id="net-cash">${money(snapshot.netCashMovement)}</p><p class="dash-compare-label">vs previous period</p><details class="dash-metric-details"><summary>Details</summary><p>${money(snapshot.netCashMovement)}</p></details></article>
          </div>
        </section>
        <section class="dash-group" aria-labelledby="dash-position">
          <h2 id="dash-position" class="dash-group-title">As of range end</h2>
          <div class="dash-kpi-row">
            <article class="dash-metric" data-metric="DB01-CB">
              <p class="metric-label">Cash and bank</p>
              <p class="metric-value" id="cash-bank">${money(snapshot.cashAndBank)}</p>
              <details class="dash-metric-details"><summary>Details</summary><p>${money(snapshot.cashAndBank)}</p><p id="card-clearing">Card clearing ${money(snapshot.cardClearing)} — Account 1200 is unsettled card receipts, not spendable cash.</p></details>
            </article>
            <article class="dash-metric" data-metric="DB01-AR"><p class="metric-label">Receivables</p><p class="metric-value" id="receivables">${money(snapshot.receivables)}</p><details class="dash-metric-details"><summary>Details</summary><p>${money(snapshot.receivables)}</p></details></article>
            <article class="dash-metric" data-metric="DB01-AP"><p class="metric-label">Payables</p><p class="metric-value" id="payables">${money(snapshot.payables)}</p><details class="dash-metric-details"><summary>Details</summary><p>${money(snapshot.payables)}</p></details></article>
          </div>
        </section>
      </div>
      <div class="grid dash-charts dash-charts-3">
        <section class="card dash-chart-card">
          <div class="card-header dash-chart-head"><h2 class="card-title">Sales trend</h2><button type="button" class="button secondary" id="sales-view-data">View data</button></div>
          <div class="card-body">
            <p class="dash-chart-legend"><span class="dash-legend-sales">Net sales</span></p>
            <div class="dash-chart"><svg id="sales-chart" viewBox="0 0 640 240" role="img">${salesBars}<line x1="44" x2="630" y1="200" y2="200" stroke="currentColor" opacity="0.35"></line></svg></div>
          </div>
          <dialog class="dash-data-dialog" id="sales-data-dialog">
            <div class="dash-data-dialog-head"><h2 class="card-title">Sales by period</h2><button type="button" class="button secondary" id="sales-close">Close</button></div>
            <table class="dash-chart-table" id="sales-table"><caption>Sales by period</caption><tbody>${salesRows}</tbody></table>
          </dialog>
        </section>
        <section class="card dash-chart-card">
          <div class="card-header dash-chart-head"><h2 class="card-title">Cash received and paid</h2><button type="button" class="button secondary" id="cash-view-data">View data</button></div>
          <div class="card-body">
            <p class="dash-chart-legend"><span class="dash-legend-in">Received</span><span class="dash-legend-out">Paid</span></p>
            <div class="dash-chart"><svg id="cash-chart" viewBox="0 0 640 240" role="img">${cashBars}</svg></div>
            <p class="dash-chart-summary">Received ${snapshot.externalCash.moneyIn} · paid ${snapshot.externalCash.moneyOut}</p>
          </div>
          <dialog class="dash-data-dialog" id="cash-data-dialog">
            <div class="dash-data-dialog-head"><h2 class="card-title">Cash received and paid</h2><button type="button" class="button secondary" id="cash-close">Close</button></div>
            <table class="dash-chart-table" id="cash-table"><caption>Cash received and paid</caption><tbody>${cashRows}</tbody></table>
            <p id="funding">Funding in ${snapshot.externalCash.fundingIn} · internal transfers ${snapshot.externalCash.transferIn} excluded</p>
          </dialog>
        </section>
        <section class="card dash-chart-card dash-expenses" aria-labelledby="dash-expenses-title">
          <div class="card-header dash-chart-head"><h2 class="card-title" id="dash-expenses-title">Where the money went</h2><a class="button secondary" href="/reports?report=pnl">Profit or loss</a></div>
          <div class="card-body">
            <div class="ch-hbars" role="img" aria-label="Biggest costs this period">
              <div class="ch-hbar"><span class="ch-hbar-label">Rent Expense</span><span class="ch-hbar-track"><span class="ch-hbar-fill" style="width:100%;background:var(--danger)"></span></span><span class="ch-hbar-value">60K</span></div>
              <div class="ch-hbar"><span class="ch-hbar-label">Salaries Expense</span><span class="ch-hbar-track"><span class="ch-hbar-fill" style="width:70%;background:var(--brand)"></span></span><span class="ch-hbar-value">42K</span></div>
              <div class="ch-hbar"><span class="ch-hbar-label">Utilities Expense</span><span class="ch-hbar-track"><span class="ch-hbar-fill" style="width:20%;background:var(--brand)"></span></span><span class="ch-hbar-value">12K</span></div>
              <div class="ch-hbar"><span class="ch-hbar-label">Bank Charges</span><span class="ch-hbar-track"><span class="ch-hbar-fill" style="width:3%;background:var(--brand)"></span></span><span class="ch-hbar-value">2K</span></div>
            </div>
            <p class="dash-expense-total">Total costs 116K LKR</p>
          </div>
        </section>
      </div>
      <section class="dash-summary" aria-label="Balances and exceptions">
        <div class="dash-aging-strip">
          <p class="dash-strip-title">Customer overdue</p>
          <p class="dash-strip-value">${money(snapshot.arAging.overdueAmount)} overdue <span>of ${money(snapshot.arAging.grandTotal)}</span></p>
          <ol class="dash-aging-segments">${agingSegments(snapshot.arAging)}</ol>
          <p><a href="/reports">View all customer overdue</a></p>
        </div>
        <div class="dash-aging-strip">
          <p class="dash-strip-title">Supplier due</p>
          <p class="dash-strip-value">${money(snapshot.apAging.overdueAmount)} overdue <span>of ${money(snapshot.apAging.grandTotal)}</span></p>
          <ol class="dash-aging-segments">${agingSegments(snapshot.apAging)}</ol>
          <p><a href="/reports">View all supplier due</a></p>
        </div>
        <div class="dash-aging-strip">
          <p class="dash-strip-title">Exceptions</p>
          <p class="dash-all-clear">All clear — no flagged items.</p>
        </div>
      </section>
      <p id="expected-net-sales" hidden>${expected.netSales}</p>
    </div>
    <script>
      document.getElementById('sales-view-data')?.addEventListener('click', () => document.getElementById('sales-data-dialog').showModal());
      document.getElementById('sales-close')?.addEventListener('click', () => document.getElementById('sales-data-dialog').close());
      document.getElementById('cash-view-data')?.addEventListener('click', () => document.getElementById('cash-data-dialog').showModal());
      document.getElementById('cash-close')?.addEventListener('click', () => document.getElementById('cash-data-dialog').close());
    </script>`;

  return shell(inner, { ...opts, company });
}

export function dashboardDb02EmptyHtml() {
  const zero = formatCompanyMoney(0, DB01_CURRENCY);
  const inner = `
    <div class="workspace dash-page" id="dashboard">
      <header class="dash-header">
        <div>
          <h1 class="dash-title">Dashboard</h1>
          <p class="dash-subtitle"><span id="company">Empty Co</span> · Month to date · as of ${DB01_AS_OF} (Asia/Colombo) · ${DB01_CURRENCY}</p>
        </div>
        <div class="dash-controls">
          <label class="dash-compare"><input type="checkbox" /> Compare previous</label>
          <button type="button" class="button secondary" id="refresh">Refresh</button>
        </div>
      </header>
      <div class="dash-kpis">
        <section class="dash-group" aria-labelledby="dash-period">
          <h2 id="dash-period" class="dash-group-title">Selected period</h2>
          <div class="dash-kpi-row">
            <article class="dash-metric"><p class="metric-label">Net sales</p><p class="metric-value" id="net-sales">${zero}</p></article>
            <article class="dash-metric"><p class="metric-label">Operating result</p><p class="metric-value">${zero}</p></article>
            <article class="dash-metric"><p class="metric-label">Net cash movement</p><p class="metric-value">${zero}</p></article>
          </div>
        </section>
        <section class="dash-group" aria-labelledby="dash-position">
          <h2 id="dash-position" class="dash-group-title">As of range end</h2>
          <div class="dash-kpi-row">
            <article class="dash-metric"><p class="metric-label">Cash and bank</p><p class="metric-value">${zero}</p></article>
            <article class="dash-metric"><p class="metric-label">Receivables</p><p class="metric-value">${zero}</p></article>
            <article class="dash-metric"><p class="metric-label">Payables</p><p class="metric-value">${zero}</p></article>
          </div>
        </section>
      </div>
      <div class="grid dash-charts dash-charts-3">
        <section class="card dash-chart-card"><div class="card-header dash-chart-head"><h2 class="card-title">Sales trend</h2></div><div class="card-body"><p class="dash-empty">No activity in selected period.</p></div></section>
        <section class="card dash-chart-card"><div class="card-header dash-chart-head"><h2 class="card-title">Cash received and paid</h2></div><div class="card-body"><p class="dash-empty">No activity in selected period.</p></div></section>
        <section class="card dash-chart-card dash-expenses"><div class="card-header dash-chart-head"><h2 class="card-title">Where the money went</h2></div><div class="card-body"><p class="dash-empty">No activity in selected period.</p></div></section>
      </div>
      <section class="dash-summary">
        <p class="dash-all-clear">All clear — no flagged items.</p>
      </section>
    </div>`;
  return shell(inner, { company: 'Empty Co' });
}
