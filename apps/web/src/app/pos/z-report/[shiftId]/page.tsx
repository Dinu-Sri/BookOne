import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getShiftZReport } from '@/app/actions/pos-session';

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function PosZReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ shiftId: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const { shiftId } = await params;
  const sp = await searchParams;
  let report;
  try {
    report = await getShiftZReport(shiftId);
  } catch {
    redirect('/login');
  }
  if (!report) redirect('/pos');

  const auto = sp.autoprint === '1';
  const variance = report.varianceCash ?? 0;

  return (
    <div className="pos-z-print-root">
      <div className="pos-z-toolbar no-print">
        <Link href="/pos">← POS</Link>
        <Link href="/sales/pos/shifts">Shifts</Link>
        <button type="button" id="z-print-btn">
          Print
        </button>
        <script
          dangerouslySetInnerHTML={{
            __html: auto
              ? `setTimeout(function(){window.print();},250);document.getElementById('z-print-btn')?.addEventListener('click',function(){window.print();});`
              : `document.getElementById('z-print-btn')?.addEventListener('click',function(){window.print();});`,
          }}
        />
      </div>

      <article className="pos-z-print-sheet">
        <h1>Z-REPORT</h1>
        <p className="center">
          {report.registerCode} — {report.registerName}
          <br />
          Status: <strong>{report.status.toUpperCase()}</strong>
        </p>
        <p>
          Opened: {new Date(report.openedAt).toLocaleString()}
          {report.openedByName ? ` · ${report.openedByName}` : ''}
          <br />
          Closed:{' '}
          {report.closedAt ? new Date(report.closedAt).toLocaleString() : '—'}
          {report.closedByName ? ` · ${report.closedByName}` : ''}
        </p>

        <h2>Sales summary</h2>
        <table>
          <tbody>
            <tr>
              <td>Sales tickets</td>
              <td className="num">{report.salesCount}</td>
            </tr>
            <tr>
              <td>Sales total</td>
              <td className="num">{money(report.salesTotal)}</td>
            </tr>
            <tr>
              <td>Return tickets</td>
              <td className="num">{report.returnsCount}</td>
            </tr>
            <tr>
              <td>Returns total</td>
              <td className="num">{money(report.returnsTotal)}</td>
            </tr>
            <tr className="grand">
              <td>Net sales</td>
              <td className="num">{money(report.netSales)}</td>
            </tr>
          </tbody>
        </table>

        <h2>Tender (sales)</h2>
        <table>
          <tbody>
            <tr>
              <td>Cash</td>
              <td className="num">{money(report.tenderSales.cash)}</td>
            </tr>
            <tr>
              <td>Card</td>
              <td className="num">{money(report.tenderSales.card)}</td>
            </tr>
            <tr>
              <td>Bank</td>
              <td className="num">{money(report.tenderSales.bank)}</td>
            </tr>
            <tr>
              <td>Mixed</td>
              <td className="num">{money(report.tenderSales.mixed)}</td>
            </tr>
          </tbody>
        </table>

        <h2>Cash drawer</h2>
        <table>
          <tbody>
            <tr>
              <td>Opening float</td>
              <td className="num">{money(report.openingFloat)}</td>
            </tr>
            <tr>
              <td>+ Cash in</td>
              <td className="num">{money(report.cashIn)}</td>
            </tr>
            <tr>
              <td>− Cash refunds</td>
              <td className="num">{money(report.cashOut)}</td>
            </tr>
            <tr className="grand">
              <td>Expected cash</td>
              <td className="num">{money(report.expectedCash)}</td>
            </tr>
            <tr>
              <td>Counted cash</td>
              <td className="num">
                {report.closingCashCount != null ? money(report.closingCashCount) : '—'}
              </td>
            </tr>
            <tr className="grand">
              <td>Variance</td>
              <td className="num">{report.varianceCash != null ? money(variance) : '—'}</td>
            </tr>
          </tbody>
        </table>

        {report.notes ? (
          <p>
            <strong>Notes:</strong> {report.notes}
          </p>
        ) : null}

        <h2>Tickets ({report.tickets.length})</h2>
        <table className="tickets">
          <thead>
            <tr>
              <th>No.</th>
              <th>Type</th>
              <th>Pay</th>
              <th className="num">Amt</th>
            </tr>
          </thead>
          <tbody>
            {report.tickets.map((t) => (
              <tr key={t.id}>
                <td>{t.documentNumber}</td>
                <td>{t.documentType === 'sales_return' ? 'RET' : 'SALE'}</td>
                <td>{t.paymentMode || '—'}</td>
                <td className="num">{money(t.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="center muted">End of Z-report</p>
      </article>

      <style>{`
        .pos-z-toolbar { display:flex; gap:16px; padding:12px; font-family:system-ui,sans-serif; }
        .pos-z-print-sheet { width: min(360px, 100%); margin: 0 auto; padding: 14px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; color:#111; }
        h1 { text-align:center; font-size: 16px; margin: 0 0 8px; letter-spacing: 0.08em; }
        h2 { font-size: 12px; margin: 14px 0 6px; border-bottom: 1px solid #111; padding-bottom: 2px; }
        .center { text-align:center; }
        .muted { color:#555; }
        table { width:100%; border-collapse: collapse; }
        td, th { padding: 3px 0; text-align:left; }
        .num { text-align:right; white-space:nowrap; }
        tr.grand td { font-weight: 800; border-top: 1px solid #111; padding-top: 6px; }
        table.tickets th, table.tickets td { border-bottom: 1px dashed #ccc; font-size: 11px; }
        @media print {
          .no-print { display:none !important; }
          .pos-z-print-sheet { width: 72mm; max-width: 72mm; }
        }
      `}</style>
    </div>
  );
}
