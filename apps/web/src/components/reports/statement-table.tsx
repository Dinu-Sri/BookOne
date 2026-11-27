import type { Statement, StatementLine } from '@bookone/accounting';

export function fmt(n: number | null | undefined) {
  if (n == null) return '';
  if (Math.abs(n) < 0.005) return '–';
  const s = Math.abs(n).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${s})` : s;
}

/** Accountant-style statement: negatives in brackets, subtotals ruled, totals double-ruled. */
export function StatementTable({
  statement,
  currentLabel,
  compareLabel,
  notes = true,
}: {
  statement: Statement;
  currentLabel: string;
  compareLabel: string | null;
  notes?: boolean;
}) {
  const has = compareLabel !== null;
  let noteNo = 0;
  return (
    <table className="fs-table">
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Line</span>
          </th>
          {notes ? <th scope="col" className="fs-note">Note</th> : null}
          <th scope="col" className="fs-num">
            {currentLabel}
            <span>LKR</span>
          </th>
          {has ? (
            <th scope="col" className="fs-num fs-cmp">
              {compareLabel}
              <span>LKR</span>
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {statement.lines.map((l: StatementLine) => {
          if (l.kind === 'heading') {
            return (
              <tr key={l.key} className="fs-heading">
                <th scope="rowgroup" colSpan={2 + (notes ? 1 : 0) + (has ? 1 : 0)}>
                  {l.label}
                </th>
              </tr>
            );
          }
          const withNote = notes && l.kind === 'line' && (l.accounts?.length ?? 0) > 0;
          if (withNote) noteNo += 1;
          return (
            <tr key={l.key} className={`fs-${l.kind}${l.level ? ' is-indented' : ''}`}>
              <th scope="row">
                {withNote ? (
                  <details className="fs-detail">
                    <summary>{l.label}</summary>
                    <ul>
                      {l.accounts!.map((a) => (
                        <li key={a.code}>
                          <span>
                            {/^\d/.test(a.code) ? `${a.code} · ` : ''}
                            {a.name}
                          </span>
                          <span className="fs-num">{fmt(a.amount)}</span>
                          {has ? <span className="fs-num fs-cmp">{fmt(a.compare)}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  l.label
                )}
              </th>
              {notes ? <td className="fs-note">{withNote ? noteNo : ''}</td> : null}
              <td className="fs-num">{fmt(l.amount)}</td>
              {has ? <td className="fs-num fs-cmp">{fmt(l.compare)}</td> : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
