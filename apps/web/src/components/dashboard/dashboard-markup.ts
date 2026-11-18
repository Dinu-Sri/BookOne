import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
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

export function dashboardDb01Html(opts?: { longLabel?: boolean; collapsedSidebar?: boolean }) {
  const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');
  const { expected, snapshot, money, sales, cash, maxCash } = db01OverviewModel();
  const company = opts?.longLabel
    ? 'DB01 Fixture Trading Company With A Very Long Registered Name For Layout'
    : 'DB01 Fixture Co';
  const collapsed = opts?.collapsedSidebar ? ' is-collapsed' : '';
  const inPct = (snapshot.externalCash.moneyIn / Math.max(snapshot.externalCash.moneyIn, snapshot.externalCash.moneyOut, 0.01)) * 100;
  const outPct = (snapshot.externalCash.moneyOut / Math.max(snapshot.externalCash.moneyIn, snapshot.externalCash.moneyOut, 0.01)) * 100;
  const salesBars = sales
    .map((p) => {
      const max = Math.max(0.01, ...sales.map((s) => Math.abs(s.value)));
      const h = (Math.abs(p.value) / max) * 140;
      return `<rect x="${sales.indexOf(p) * 40 + 8}" y="${150 - h}" width="28" height="${h}" fill="#1677c9"></rect>`;
    })
    .join('');
  const cashBars = cash
    .map((p, i) => {
      const inH = (p.moneyIn / maxCash) * 140;
      const outH = (p.moneyOut / maxCash) * 140;
      return `<g>
        <rect data-cash-in="${p.key}" x="${i * 40 + 6}" y="${150 - inH}" width="14" height="${inH}" fill="#15835f"></rect>
        <rect data-cash-out="${p.key}" x="${i * 40 + 22}" y="${150 - outH}" width="14" height="${outH}" fill="#c94141"></rect>
      </g>`;
    })
    .join('');

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
    <div class="workspace dash-page" id="dashboard">
      <header class="dash-header">
        <div>
          <p class="eyebrow">Business overview</p>
          <h1 class="h1" id="company">${company}</h1>
          <p class="lead">${DB01_PERIOD.from} to ${DB01_PERIOD.to} · Positions as of ${DB01_AS_OF}</p>
        </div>
        <div class="dash-controls">
          <label class="dash-compare"><input type="checkbox" checked /> Compare previous equivalent interval</label>
          <button type="button" class="btn secondary" id="refresh">Refresh</button>
        </div>
      </header>
      <section class="dash-group" aria-labelledby="dash-period">
        <h2 id="dash-period" class="dash-group-title">Selected period</h2>
        <div class="grid metrics dash-metrics-3">
          <article class="dash-metric" data-metric="DB01-NS"><p class="metric-label">Net sales</p><p class="metric-value" id="net-sales">${money(snapshot.netSales)}</p></article>
          <article class="dash-metric" data-metric="DB01-OR"><p class="metric-label">Operating result</p><p class="metric-value" id="operating-result">${money(snapshot.operatingResult)}</p></article>
          <article class="dash-metric" data-metric="DB01-NCM"><p class="metric-label">Net cash movement</p><p class="metric-value" id="net-cash">${money(snapshot.netCashMovement)}</p></article>
        </div>
      </section>
      <section class="dash-group" aria-labelledby="dash-position">
        <h2 id="dash-position" class="dash-group-title">As of range end</h2>
        <div class="grid metrics dash-metrics-3">
          <article class="dash-metric" data-metric="DB01-CB"><p class="metric-label">Cash and bank</p><p class="metric-value" id="cash-bank">${money(snapshot.cashAndBank)}</p></article>
          <article class="dash-metric" data-metric="DB01-AR"><p class="metric-label">Receivables</p><p class="metric-value">${money(snapshot.receivables)}</p></article>
          <article class="dash-metric" data-metric="DB01-AP"><p class="metric-label">Payables</p><p class="metric-value">${money(snapshot.payables)}</p></article>
        </div>
        <p class="dash-clearing" id="card-clearing">Card clearing ${money(snapshot.cardClearing)} — Account 1200 is unsettled card receipts, not spendable cash.</p>
      </section>
      <div class="grid two dash-charts">
        <section class="card">
          <div class="card-header"><h2 class="card-title">Net sales trend</h2></div>
          <div class="card-body">
            <svg id="sales-chart" viewBox="0 0 640 180" role="img">${salesBars}</svg>
            <table class="dash-chart-table" id="sales-table"><caption>Sales by period</caption><tbody>${sales.map((p) => `<tr><th>${p.label}</th><td>${p.value}</td></tr>`).join('')}</tbody></table>
          </div>
        </section>
        <section class="card">
          <div class="card-header"><h2 class="card-title">Received and paid</h2></div>
          <div class="card-body">
            <div class="dash-bar-pair" id="cash-pair">
              <div><span>Received ${snapshot.externalCash.moneyIn}</span><div class="cashflow-track"><i id="in-bar" style="width:${inPct}%"></i></div></div>
              <div><span>Paid ${snapshot.externalCash.moneyOut}</span><div class="cashflow-track out"><i id="out-bar" style="width:${outPct}%"></i></div></div>
            </div>
            <svg id="cash-chart" viewBox="0 0 640 180" role="img">${cashBars}</svg>
            <p id="funding">Funding in ${snapshot.externalCash.fundingIn} · internal transfers ${snapshot.externalCash.transferIn} excluded</p>
          </div>
        </section>
      </div>
      <p class="dash-deferred">Deferred: Historical stock valuation and stock aging (no stock snapshots).</p>
      <p id="expected-net-sales" hidden>${expected.netSales}</p>
    </div>
  </main>
</div>
</body></html>`;
}
