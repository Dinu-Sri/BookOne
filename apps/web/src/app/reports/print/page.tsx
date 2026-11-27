import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Statement } from '@bookone/accounting';
import { getFinancialStatements } from '@/app/actions/financial-statements';
import { PrintSheetButton } from '@/components/print/print-sheet-button';
import { StatementTable, fmt } from '@/components/reports/statement-table';

function longDate(iso: string | null) {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Professional print / PDF of the financial statements (one statement per A4 page). */
export default async function ReportsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; report?: string }>;
}) {
  const q = await searchParams;
  let pack;
  try {
    pack = await getFinancialStatements(q.period ?? 'this_fy');
  } catch {
    redirect('/login?from=/reports');
  }
  const { from, to } = pack.period;
  const forPeriod = from && to ? `for the period ${longDate(from)} to ${longDate(to)}` : 'for all time';
  const asAt = to ? `as at ${longDate(to)}` : 'as at today';
  const cur = from && to ? (pack.period.label || longDate(to)) : 'All time';
  const cmpPeriod = pack.compare ? `${longDate(pack.compare.from)} – ${longDate(pack.compare.to)}` : null;
  const which = q.report ?? 'all';
  const list: Array<{ s: Statement; sub: string; current: string; compare: string | null }> = [];
  if (which === 'all' || which === 'pnl') list.push({ s: pack.profitOrLoss, sub: forPeriod, current: cur, compare: cmpPeriod });
  if (which === 'all' || which === 'balance') {
    list.push({ s: pack.financialPosition, sub: asAt, current: to ? longDate(to) : 'Today', compare: pack.compare ? longDate(pack.compare.to) : null });
  }
  if (which === 'all' || which === 'equity') list.push({ s: pack.changesInEquity, sub: forPeriod, current: cur, compare: null });
  if (which === 'all' || which === 'cashflow') list.push({ s: pack.cashFlows, sub: forPeriod, current: cur, compare: cmpPeriod });
  const title = which === 'all' ? 'Financial statements' : list[0]?.s.title ?? 'Financial statements';

  return (
    <div className="fsp-root">
      <div className="fsp-toolbar no-print">
        <Link href={`/reports?period=${encodeURIComponent(pack.period.token)}`}>← Back to reports</Link>
        <span>Choose &quot;Save as PDF&quot; in the print dialog for a PDF. Turn off Headers and footers.</span>
        <PrintSheetButton />
      </div>

      {list.map(({ s, sub, current, compare }, i) => (
        <section className="fsp-page" key={s.id} data-print-title={`${pack.company.name} ${title}`}>
          <header className="fsp-head">
            <p className="fsp-company">{pack.company.name}</p>
            {i === 0 ? (
              <p className="fsp-meta">
                {[pack.company.address, pack.company.registration && `Company reg. ${pack.company.registration}`, pack.company.tin && `TIN ${pack.company.tin}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}
            <h1>{s.title}</h1>
            <p className="fsp-sub">{sub.charAt(0).toUpperCase() + sub.slice(1)}</p>
          </header>
          <StatementTable statement={s} currentLabel={current} compareLabel={compare} notes={false} />
          {s.checks.some((c) => !c.ok) ? (
            <p className="fsp-warn">
              Check: {s.checks.filter((c) => !c.ok).map((c) => `${c.label} (difference ${fmt(c.difference)})`).join('; ')}.
            </p>
          ) : null}
          <footer className="fsp-foot">
            <span>The notes form part of these financial statements. Figures in brackets are negative. Amounts in Sri Lankan Rupees.</span>
            <span>
              Page {i + 1} of {list.length + 1}
            </span>
          </footer>
        </section>
      ))}

      <section className="fsp-page">
        <header className="fsp-head">
          <p className="fsp-company">{pack.company.name}</p>
          <h1>Notes to the financial statements</h1>
          <p className="fsp-sub">{forPeriod.charAt(0).toUpperCase() + forPeriod.slice(1)}</p>
        </header>
        <h2 className="fsp-h2">1. Basis of preparation</h2>
        <p className="fsp-p">
          These financial statements are presented in the format of the Sri Lanka Accounting Standard for Small and
          Medium-sized Entities (SLFRS for SMEs) issued by CA Sri Lanka, on the accrual basis and the historical cost
          convention, in Sri Lankan Rupees. They are prepared from the books kept in BookOne. Expenses are classified by
          function. Comparative figures are for {cmpPeriod ?? 'no earlier period'}.
        </p>
        <p className="fsp-p">
          They should be reviewed by a qualified accountant before they are approved by the directors or filed with any
          authority.
        </p>
        <h2 className="fsp-h2">2. Composition of the amounts</h2>
        {[pack.profitOrLoss, pack.financialPosition].map((s) => (
          <div key={s.id} className="fsp-notes">
            <h3>{s.title}</h3>
            {s.lines
              .filter((l) => l.kind === 'line' && (l.accounts?.length ?? 0) > 0)
              .map((l) => (
                <table key={l.key} className="fsp-note-table">
                  <caption>{l.label}</caption>
                  <tbody>
                    {l.accounts!.map((a) => (
                      <tr key={a.code}>
                        <td>
                          {/^\d/.test(a.code) ? `${a.code} ` : ''}
                          {a.name}
                        </td>
                        <td className="fs-num">{fmt(a.amount)}</td>
                        {pack.compare ? <td className="fs-num">{fmt(a.compare)}</td> : null}
                      </tr>
                    ))}
                    <tr className="fs-subtotal">
                      <td>Total</td>
                      <td className="fs-num">{fmt(l.amount)}</td>
                      {pack.compare ? <td className="fs-num">{fmt(l.compare)}</td> : null}
                    </tr>
                  </tbody>
                </table>
              ))}
          </div>
        ))}
        <h2 className="fsp-h2">Approval</h2>
        <p className="fsp-p">The financial statements were approved by the board of directors on ____________________.</p>
        <div className="fsp-signs">
          <div>
            <span />
            Director
          </div>
          <div>
            <span />
            Director
          </div>
          <div>
            <span />
            Accountant
          </div>
        </div>
        <footer className="fsp-foot">
          <span>Prepared with BookOne on {longDate(pack.generatedAt.slice(0, 10))}.</span>
          <span>
            Page {list.length + 1} of {list.length + 1}
          </span>
        </footer>
      </section>

      <style>{`
        .fsp-root { background: #eef2f7; min-height: 100dvh; padding: 0 0 32px; color: #111827; font-family: Inter, "Segoe UI", Arial, sans-serif; }
        .fsp-toolbar { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; padding: 12px 20px; background: #fff; border-bottom: 1px solid #dde5ef; font-size: 14px; }
        .fsp-toolbar span { color: #5b6b7f; font-size: 12px; margin-left: auto; }
        .fsp-page { box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 20px auto; padding: 18mm 16mm 14mm; background: #fff; box-shadow: 0 8px 28px rgba(15,23,42,.12); display: flex; flex-direction: column; font-size: 10pt; }
        .fsp-head { text-align: center; margin-bottom: 14px; }
        .fsp-company { margin: 0; font-size: 13pt; font-weight: 800; letter-spacing: .01em; }
        .fsp-meta { margin: 2px 0 0; color: #4b5563; font-size: 8.5pt; }
        .fsp-head h1 { margin: 10px 0 2px; font-size: 14pt; font-weight: 800; }
        .fsp-sub { margin: 0; color: #374151; }
        .fsp-h2 { font-size: 11pt; margin: 14px 0 4px; }
        .fsp-p { margin: 0 0 8px; line-height: 1.5; text-align: justify; }
        .fsp-notes h3 { font-size: 10pt; margin: 10px 0 4px; }
        .fsp-note-table { width: 100%; border-collapse: collapse; margin: 0 0 8px; font-size: 9pt; }
        .fsp-note-table caption { text-align: left; font-weight: 700; padding: 2px 0; }
        .fsp-note-table td { padding: 2px 0; }
        .fsp-warn { color: #b42318; font-weight: 700; }
        .fsp-foot { margin-top: auto; padding-top: 10px; display: flex; justify-content: space-between; gap: 12px; color: #6b7280; font-size: 8pt; border-top: 1px solid #e5e7eb; }
        .fsp-signs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 46px; text-align: center; font-size: 9pt; }
        .fsp-signs span { display: block; border-top: 1px dotted #111827; margin-bottom: 4px; }
        .fsp-root .fs-table { font-size: 10pt; }
        @page { size: A4; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          .fsp-root { background: #fff; padding: 0; }
          .fsp-page { margin: 0; box-shadow: none; page-break-after: always; break-after: page; }
          .fsp-page:last-child { page-break-after: auto; break-after: auto; }
          .fs-detail summary::marker, .fs-detail summary::-webkit-details-marker { display: none; }
        }
      `}</style>
    </div>
  );
}
