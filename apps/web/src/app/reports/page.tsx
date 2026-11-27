import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Download, FileSpreadsheet, Printer, TriangleAlert } from 'lucide-react';
import { CURRENT_EARNINGS_CODE, vatReportCsv, type Statement, type VatReportSummary } from '@bookone/accounting';
import { getFinancialStatements, type FinancialStatementsPack } from '@/app/actions/financial-statements';
import { getPeriodOptions, getReports, getTenantInfo, type ReportRow } from '@/app/actions/workspace';
import { BalanceColumns, Waterfall, compactMoney } from '@/components/charts/simple-charts';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { StatementTable, fmt } from '@/components/reports/statement-table';

type ReportView = 'pnl' | 'balance' | 'cashflow' | 'equity' | 'trial' | 'ledger' | 'vat';

interface SearchParams {
  period?: string;
  report?: ReportView;
}

const GROUPS: Array<{ title: string; items: Array<{ id: ReportView; label: string; hint: string }> }> = [
  {
    title: 'Financial statements',
    items: [
      { id: 'pnl', label: 'Profit or loss', hint: 'Did we make money?' },
      { id: 'balance', label: 'Financial position', hint: 'What we own and owe' },
      { id: 'cashflow', label: 'Cash flows', hint: 'Where the cash went' },
      { id: 'equity', label: 'Changes in equity', hint: "The owners' share" },
    ],
  },
  {
    title: 'Accounting detail',
    items: [
      { id: 'trial', label: 'Trial balance', hint: 'Every account' },
      { id: 'ledger', label: 'General ledger', hint: 'Every journal' },
      { id: 'vat', label: 'VAT summary', hint: 'Output and input VAT' },
    ],
  },
];

function href(period: string | undefined, report: ReportView) {
  const p = new URLSearchParams();
  if (period) p.set('period', period);
  p.set('report', report);
  return `/reports?${p.toString()}`;
}

function longDate(iso: string | null) {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function formatLKR(value: number) {
  const sign = value < 0 ? '-' : '';
  return `${sign}LKR ${Math.abs(value).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function v(s: Statement, key: string) {
  return s.lines.find((l) => l.key === key)?.amount ?? 0;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  let tenant;
  let data;
  let periodOptions;
  let pack: FinancialStatementsPack;
  try {
    [tenant, data, periodOptions, pack] = await Promise.all([
      getTenantInfo(),
      getReports(params?.period),
      getPeriodOptions(params?.period),
      getFinancialStatements(params?.period ?? 'this_month'),
    ]);
  } catch {
    redirect('/login');
  }

  const all = GROUPS.flatMap((g) => g.items);
  const active: ReportView = all.some((i) => i.id === params?.report) ? params.report! : 'pnl';
  const activeItem = all.find((i) => i.id === active)!;
  const periodLabel = periodOptions.label || 'All time';
  const from = pack.period.from;
  const to = pack.period.to;
  const forPeriod = from && to ? `For the period ${longDate(from)} to ${longDate(to)}` : 'For all time';
  const asAt = to ? `As at ${longDate(to)}` : 'As at today';
  const currentCol = active === 'balance' ? (to ? longDate(to) : 'Today') : periodLabel;
  const compareCol = pack.compare
    ? active === 'balance'
      ? longDate(pack.compare.to)
      : `${longDate(pack.compare.from)} – ${longDate(pack.compare.to)}`
    : null;
  const statement: Statement | null =
    active === 'pnl'
      ? pack.profitOrLoss
      : active === 'balance'
        ? pack.financialPosition
        : active === 'cashflow'
          ? pack.cashFlows
          : active === 'equity'
            ? pack.changesInEquity
            : null;
  const subtitle = active === 'balance' ? asAt : forPeriod;
  const exportQuery = new URLSearchParams({ period: pack.period.token }).toString();
  const printHref = `/reports/print?${new URLSearchParams({ period: pack.period.token, report: statement ? active : 'all' }).toString()}`;

  return (
    <BookOneShell active="Reports" tenant={tenant} period={periodOptions}>
      <div className="workspace ux-page rp-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Reports</h1>
              <p>Your financial statements, live from your books, with the same period last time beside them.</p>
            </div>
          </div>
          <div className="ux-head-actions">
            <a href={`/api/reports/export?${exportQuery}`} className="button secondary" download>
              <FileSpreadsheet size={15} aria-hidden /> Excel
            </a>
            <Link href={printHref} className="button primary" target="_blank" rel="noopener noreferrer">
              <Printer size={15} aria-hidden /> Print or save PDF
            </Link>
          </div>
        </header>

        <div className="rp-grid">
          <nav className="rp-nav" aria-label="Reports">
            {GROUPS.map((g) => (
              <div key={g.title} className="rp-nav-group">
                <h2>{g.title}</h2>
                {g.items.map((i) => (
                  <Link key={i.id} href={href(params?.period, i.id)} aria-current={active === i.id ? 'page' : undefined}>
                    <strong>{i.label}</strong>
                    <span>{i.hint}</span>
                  </Link>
                ))}
              </div>
            ))}
            <div className="rp-nav-group rp-nav-figures">
              <h2>{periodLabel}</h2>
              <dl className="ux-statement">
                <div>
                  <dt>Revenue </dt>
                  <dd>{compactMoney(pack.headline.revenue)}</dd>
                </div>
                <div>
                  <dt>Profit </dt>
                  <dd className={pack.headline.profit < 0 ? 'is-neg' : ''}>{compactMoney(pack.headline.profit)}</dd>
                </div>
                <div>
                  <dt>Cash now </dt>
                  <dd>{compactMoney(pack.headline.cash)}</dd>
                </div>
              </dl>
            </div>
          </nav>

          <section className="rp-main" aria-labelledby="rp-title">
            <header className="rp-main-head">
              <div>
                <h2 id="rp-title">{statement ? statement.title : activeItem.label}</h2>
                <p>
                  {pack.company.name} · {statement ? subtitle : periodLabel}
                  {statement ? ' · Amounts in LKR' : ''}
                </p>
              </div>
              {statement ? (
                statement.checks.every((c) => c.ok) ? (
                  <span className="rp-check is-ok">
                    <CheckCircle2 size={15} aria-hidden /> {statement.checks[0]?.label}
                  </span>
                ) : (
                  <span className="rp-check is-bad">
                    <TriangleAlert size={15} aria-hidden /> {statement.checks.find((c) => !c.ok)?.label}: off by {fmt(statement.checks.find((c) => !c.ok)?.difference)}
                  </span>
                )
              ) : null}
            </header>

            {statement ? (
              <div className="rp-body">
                <div className="rp-statement">
                  <StatementTable statement={statement} currentLabel={currentCol} compareLabel={compareCol} />
                  <p className="rp-foot">
                    Presented in the format of SLFRS for SMEs. Figures in brackets are negative. Open a line to see the
                    accounts behind it.
                  </p>
                </div>
                <aside className="rp-visual" aria-label="Picture of this statement">
                  <StatementPicture active={active} pack={pack} />
                </aside>
              </div>
            ) : (
              <div className="rp-body rp-body-single">
                {active === 'trial' ? <TrialBalanceTable rows={data.trialBalance} /> : null}
                {active === 'ledger' ? (
                  <div className="table-wrap">
                    <table className="table rp-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Party</th>
                          <th>Memo</th>
                          <th>Lines</th>
                          <th className="rp-num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.generalLedger.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="rp-muted">
                              No journal entries in this period.
                            </td>
                          </tr>
                        ) : (
                          data.generalLedger.map((entry) => (
                            <tr key={entry.id}>
                              <td>{entry.entryDate}</td>
                              <td>{entry.party}</td>
                              <td>{entry.memo}</td>
                              <td>{entry.lines.length}</td>
                              <td className="rp-num">{formatLKR(entry.amount)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {active === 'vat' ? <VatSummaryPanel summary={data.vat} periodLabel={periodLabel} /> : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </BookOneShell>
  );
}

function StatementPicture({ active, pack }: { active: ReportView; pack: FinancialStatementsPack }) {
  if (active === 'pnl') {
    const s = pack.profitOrLoss;
    const steps = [
      { label: 'Revenue', value: v(s, 'revenue'), kind: 'start' as const },
      { label: 'Cost of sales', value: -v(s, 'cost_of_sales'), kind: 'step' as const },
      { label: 'Other income', value: v(s, 'other_income'), kind: 'step' as const },
      { label: 'Running costs', value: -(v(s, 'distribution') + v(s, 'administrative')), kind: 'step' as const },
      { label: 'Finance', value: -v(s, 'finance_costs'), kind: 'step' as const },
      { label: 'Tax', value: -v(s, 'income_tax'), kind: 'step' as const },
      { label: 'Profit', value: v(s, 'profit_for_period'), kind: 'end' as const },
    ].filter((x) => x.kind !== 'step' || Math.abs(x.value) >= 0.005);
    const rev = v(s, 'revenue');
    const gm = rev ? (v(s, 'gross_profit') / rev) * 100 : null;
    const nm = rev ? (v(s, 'profit_for_period') / rev) * 100 : null;
    const prev = pack.headline.profitCompare;
    return (
      <>
        <h3>From sales to profit</h3>
        <Waterfall steps={steps} title="From sales to profit" />
        <dl className="ux-statement rp-kpis">
          <div>
            <dt>Gross margin </dt>
            <dd>{gm == null ? '–' : `${gm.toFixed(1)}%`}</dd>
          </div>
          <div>
            <dt>Net margin </dt>
            <dd>{nm == null ? '–' : `${nm.toFixed(1)}%`}</dd>
          </div>
          {prev != null ? (
            <div>
              <dt>Profit last time </dt>
              <dd>{compactMoney(prev)}</dd>
            </div>
          ) : null}
        </dl>
      </>
    );
  }
  if (active === 'balance') {
    const s = pack.financialPosition;
    const nca = v(s, 'total_non_current_assets');
    return (
      <>
        <h3>What you own and how it is funded</h3>
        <BalanceColumns
          title="Financial position"
          left={{
            label: 'You own',
            parts: [
              { label: 'Long-term', value: nca, tone: 'muted' },
              { label: 'Stock', value: v(s, 'inventories'), tone: 'warning' },
              { label: 'Owed to you', value: v(s, 'receivables'), tone: 'brand' },
              { label: 'Cash', value: v(s, 'cash'), tone: 'success' },
              { label: 'Other', value: v(s, 'other_current_assets'), tone: 'muted' },
            ],
          }}
          right={{
            label: 'Funded by',
            parts: [
              { label: 'Owners', value: v(s, 'total_equity'), tone: 'success' },
              { label: 'Long-term debt', value: v(s, 'total_non_current_liabilities'), tone: 'danger' },
              { label: 'You owe now', value: v(s, 'total_current_liabilities'), tone: 'warning' },
            ],
          }}
        />
        <dl className="ux-statement rp-kpis">
          <div>
            <dt>Current ratio </dt>
            <dd>
              {v(s, 'total_current_liabilities') > 0.005
                ? `${(v(s, 'total_current_assets') / v(s, 'total_current_liabilities')).toFixed(2)} : 1`
                : '–'}
            </dd>
          </div>
          <div>
            <dt>Working capital </dt>
            <dd>{compactMoney(v(s, 'total_current_assets') - v(s, 'total_current_liabilities'))}</dd>
          </div>
        </dl>
      </>
    );
  }
  if (active === 'cashflow') {
    const s = pack.cashFlows;
    return (
      <>
        <h3>Cash at the start, in and out, at the end</h3>
        <Waterfall
          title="Cash flows"
          steps={[
            { label: 'Start', value: v(s, 'opening_cash'), kind: 'start' },
            { label: 'Operating', value: v(s, 'net_operating'), kind: 'step' },
            { label: 'Investing', value: v(s, 'net_investing'), kind: 'step' },
            { label: 'Financing', value: v(s, 'net_financing'), kind: 'step' },
            { label: 'End', value: v(s, 'closing_cash'), kind: 'end' },
          ]}
        />
        <p className="rp-muted">Operating is cash from trading: money from customers less money paid to suppliers, staff and tax.</p>
      </>
    );
  }
  const s = pack.changesInEquity;
  return (
    <>
      <h3>How the owners&apos; share moved</h3>
      <Waterfall
        title="Changes in equity"
        steps={[
          { label: 'Start', value: v(s, 'opening'), kind: 'start' as const },
          { label: 'Profit', value: v(s, 'profit'), kind: 'step' as const },
          { label: 'Capital', value: v(s, 'capital'), kind: 'step' as const },
          { label: 'Drawings', value: v(s, 'drawings'), kind: 'step' as const },
          { label: 'End', value: v(s, 'closing'), kind: 'end' as const },
        ].filter((x) => x.kind !== 'step' || Math.abs(x.value) >= 0.005)}
      />
    </>
  );
}

function VatSummaryPanel({ summary, periodLabel }: { summary: VatReportSummary; periodLabel: string }) {
  const csv = vatReportCsv(summary, periodLabel);
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  const filePeriod = periodLabel.replace(/[^\w.-]+/g, '-').slice(0, 40) || 'period';
  return (
    <div className="rp-vat">
      <dl className="ux-statement rp-vat-sum">
        <div>
          <dt>Output VAT (on sales) </dt>
          <dd>{formatLKR(summary.outputVat)}</dd>
        </div>
        <div>
          <dt>Input VAT (on purchases) </dt>
          <dd>{formatLKR(summary.inputVat)}</dd>
        </div>
        <div className="is-total">
          <dt>VAT to pay (output − input) </dt>
          <dd>{formatLKR(summary.netPayable)}</dd>
        </div>
      </dl>
      <p className="rp-muted">
        {summary.disclaimer}{' '}
        <a href={csvHref} download={`bookone-vat-${filePeriod}.csv`}>
          <Download size={13} aria-hidden /> Export CSV
        </a>
      </p>
      <div className="table-wrap">
        <table className="table rp-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Party</th>
              <th>Account</th>
              <th>Side</th>
              <th>Memo</th>
              <th className="rp-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {summary.correspondence.length === 0 ? (
              <tr>
                <td colSpan={6} className="rp-muted">
                  No VAT journal lines in this period.
                </td>
              </tr>
            ) : (
              summary.correspondence.map((row, i) => (
                <tr key={`${row.date}-${row.accountCode}-${row.side}-${i}`}>
                  <td>{row.date}</td>
                  <td>{row.party}</td>
                  <td>{row.accountCode}</td>
                  <td>{row.side}</td>
                  <td>{row.memo}</td>
                  <td className="rp-num">{formatLKR(row.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statementLineLabel(row: ReportRow): string {
  if (!row.accountCode || row.accountCode === CURRENT_EARNINGS_CODE) return row.accountName;
  return `${row.accountCode} - ${row.accountName}`;
}

function TrialBalanceTable({ rows }: { rows: ReportRow[] }) {
  const shown = rows.filter((r) => Math.abs(r.debit) >= 0.005 || Math.abs(r.credit) >= 0.005 || Math.abs(r.balance) >= 0.005);
  const dr = shown.reduce((s, r) => s + (r.balance > 0 && (r.type === 'asset' || r.type === 'expense') ? r.balance : r.balance < 0 && !(r.type === 'asset' || r.type === 'expense') ? -r.balance : 0), 0);
  const cr = shown.reduce((s, r) => s + (r.balance > 0 && !(r.type === 'asset' || r.type === 'expense') ? r.balance : r.balance < 0 && (r.type === 'asset' || r.type === 'expense') ? -r.balance : 0), 0);
  return (
    <div className="table-wrap">
      <table className="table rp-table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Type</th>
            <th className="rp-num">Debit</th>
            <th className="rp-num">Credit</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr>
              <td colSpan={4} className="rp-muted">
                No balances yet.
              </td>
            </tr>
          ) : (
            shown.map((row) => {
              const debitSide = row.type === 'asset' || row.type === 'expense' ? row.balance >= 0 : row.balance < 0;
              return (
                <tr key={row.accountCode}>
                  <td>{statementLineLabel(row)}</td>
                  <td className="rp-muted">{row.type}</td>
                  <td className="rp-num">{debitSide ? fmt(Math.abs(row.balance)) : ''}</td>
                  <td className="rp-num">{!debitSide ? fmt(Math.abs(row.balance)) : ''}</td>
                </tr>
              );
            })
          )}
        </tbody>
        {shown.length ? (
          <tfoot>
            <tr className="rp-total">
              <th colSpan={2}>Total</th>
              <td className="rp-num">{fmt(dr)}</td>
              <td className="rp-num">{fmt(cr)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
