import type { ReconReportData } from '@/app/actions/bank-reconciliation';

function formatRs(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '-';
  const sign = n < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(n).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '-';
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Formal printable bank reconciliation report (print -> PDF from browser).
 */
export function ReconciliationReportView({
  data,
  backHref,
}: {
  data: ReconReportData;
  backHref: string;
}) {
  const matched = data.lines.filter(
    (l) => l.caseType === 'match_1_1' && l.state === 'confirmed',
  );
  const added = data.lines.filter(
    (l) =>
      (l.caseType === 'create_entry' || l.caseType === 'group_match') &&
      l.state === 'confirmed',
  );
  const transfers = data.lines.filter(
    (l) => l.caseType === 'transfer' && l.state === 'confirmed',
  );
  const waiting = data.lines.filter(
    (l) => l.caseType === 'outstanding_book' && l.state === 'confirmed',
  );
  const excluded = data.lines.filter(
    (l) => l.state === 'excluded' || l.caseType === 'duplicate',
  );

  return (
    <div className="brp-root">
      <div className="brp-toolbar no-print">
        <a href={backHref}>← Back to workbench</a>
        <button type="button" id="brp-print-btn">
          Print / Save PDF
        </button>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.getElementById('brp-print-btn')?.addEventListener('click',function(){window.print();});`,
          }}
        />
      </div>

      <article className="brp-sheet">
        <header className="brp-header">
          <p className="brp-eyebrow">Bank reconciliation statement</p>
          <h1>{data.companyName}</h1>
          <p>
            <strong>{data.bankName}</strong>
            {data.bankCode ? ` · ${data.bankCode}` : ''}
          </p>
          <p>
            Period: <strong>{data.periodLabel}</strong>
          </p>
          <p>
            Status: <strong>{data.statusLabel}</strong>
            {data.reconciledAt
              ? ` · Finished ${new Date(data.reconciledAt).toLocaleString('en-GB')}`
              : ''}
          </p>
        </header>

        <section className="brp-section">
          <h2>Balances</h2>
          <table className="brp-table">
            <tbody>
              <tr>
                <td>Statement opening</td>
                <td className="num">{formatRs(data.statementOpening)}</td>
              </tr>
              <tr>
                <td>Statement closing</td>
                <td className="num">{formatRs(data.statementClosing)}</td>
              </tr>
              <tr>
                <td>BookOne balance</td>
                <td className="num">{formatRs(data.bookClosing)}</td>
              </tr>
              <tr>
                <td>Outstanding / timing</td>
                <td className="num">{formatRs(data.outstandingNet)}</td>
              </tr>
              <tr className="strong">
                <td>Difference left</td>
                <td className="num">{formatRs(data.difference)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="brp-section">
          <h2>Summary</h2>
          <table className="brp-table">
            <tbody>
              <tr>
                <td>Bank transactions (session)</td>
                <td className="num">{data.review.bankLines}</td>
              </tr>
              <tr>
                <td>Matched existing</td>
                <td className="num">{data.review.matched}</td>
              </tr>
              <tr>
                <td>Added to BookOne</td>
                <td className="num">{data.review.added}</td>
              </tr>
              <tr>
                <td>Transfers</td>
                <td className="num">{data.review.transfers}</td>
              </tr>
              <tr>
                <td>Waiting to clear</td>
                <td className="num">{data.review.waiting}</td>
              </tr>
              <tr>
                <td>Duplicates / excluded</td>
                <td className="num">{data.review.duplicates}</td>
              </tr>
              <tr>
                <td>Still needs attention</td>
                <td className="num">{data.review.needsAttention}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {data.sourceFiles.length > 0 ? (
          <section className="brp-section">
            <h2>Source files</h2>
            <ul className="brp-files">
              {data.sourceFiles.map((f, i) => (
                <li key={i}>{f.fileName}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <ReportBlock title="Matched existing" rows={matched} />
        <ReportBlock title="Added to BookOne" rows={added} />
        <ReportBlock title="Transfers" rows={transfers} />
        <ReportBlock title="Waiting to clear" rows={waiting} />
        <ReportBlock title="Excluded / duplicates" rows={excluded} />

        <footer className="brp-footer">
          <p>
            Generated {new Date().toLocaleString('en-GB')}. This statement does not close the
            accounting period.
          </p>
        </footer>
      </article>
    </div>
  );
}

function ReportBlock({
  title,
  rows,
}: {
  title: string;
  rows: ReconReportData['lines'];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="brp-section">
      <h2>
        {title} ({rows.length})
      </h2>
      <table className="brp-table lines">
        <thead>
          <tr>
            <th>Bank</th>
            <th>BookOne</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                {r.bankDate ? (
                  <>
                    <div>{formatDate(r.bankDate)}</div>
                    <div className="muted">{r.bankDesc}</div>
                    <div className="num">{formatRs(r.bankAmount)}</div>
                  </>
                ) : (
                  '-'
                )}
              </td>
              <td>
                {r.bookDate ? (
                  <>
                    <div>{formatDate(r.bookDate)}</div>
                    <div className="muted">{r.bookDesc}</div>
                    <div className="num">{formatRs(r.bookAmount)}</div>
                  </>
                ) : (
                  '-'
                )}
              </td>
              <td>{r.resultLabel ?? r.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
