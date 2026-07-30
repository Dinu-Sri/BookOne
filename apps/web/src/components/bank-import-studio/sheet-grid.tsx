'use client';

export type SheetHighlight = {
  /** Absolute workbook row indices (0-based) */
  rows?: number[];
  /** Column indices */
  cols?: number[];
  /** Named roles for color legend */
  colRoles?: Record<number, 'date' | 'desc' | 'out' | 'in' | 'amount' | 'type' | 'balance' | 'active'>;
  /** Dim rows strictly above header */
  dimAboveRow?: number | null;
  /** Click mode */
  clickMode?: 'row' | 'column' | 'none';
  onRowClick?: (absRow: number) => void;
  onColClick?: (col: number) => void;
};

/**
 * Excel-like sheet preview with step-driven highlights.
 */
export function SheetGrid({
  grid,
  startRow,
  totalRows,
  highlight,
  fileLabel,
}: {
  grid: string[][];
  startRow: number;
  totalRows: number;
  highlight: SheetHighlight;
  fileLabel?: string;
}) {
  const colCount = grid[0]?.length ?? 0;
  const rowSet = new Set(highlight.rows ?? []);
  const colSet = new Set(highlight.cols ?? []);
  const roles = highlight.colRoles ?? {};

  return (
    <div className="bis-excel">
      <div className="bis-excel-bar">
        <span className="bis-excel-title">{fileLabel ?? 'Sheet'}</span>
        <span className="bis-excel-meta">
          {totalRows} rows · {colCount} cols
          {grid.length < totalRows ? ` · showing first ${grid.length}` : ''}
        </span>
      </div>
      <div className="bis-excel-scroll">
        <table className="bis-excel-table">
          <thead>
            <tr>
              <th className="bis-excel-corner" />
              {Array.from({ length: colCount }, (_, c) => (
                <th
                  key={c}
                  className={`bis-excel-colhead ${colSet.has(c) ? 'hl' : ''} ${roles[c] ? `role-${roles[c]}` : ''}`}
                  onClick={() => {
                    if (highlight.clickMode === 'column') highlight.onColClick?.(c);
                  }}
                >
                  {colLetter(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, ri) => {
              const abs = startRow + ri;
              const isHeader = rowSet.has(abs);
              const dim =
                highlight.dimAboveRow != null && abs < highlight.dimAboveRow;
              return (
                <tr
                  key={abs}
                  className={`${isHeader ? 'row-hl' : ''} ${dim ? 'row-dim' : ''}`}
                  onClick={() => {
                    if (highlight.clickMode === 'row') highlight.onRowClick?.(abs);
                  }}
                >
                  <th className="bis-excel-rowhead">{abs + 1}</th>
                  {Array.from({ length: colCount }, (_, c) => {
                    const role = roles[c];
                    const colHl = colSet.has(c);
                    return (
                      <td
                        key={c}
                        className={`${colHl ? 'col-hl' : ''} ${role ? `role-${role}` : ''} ${
                          isHeader && colHl ? 'cell-focus' : ''
                        }`}
                        onClick={(e) => {
                          if (highlight.clickMode === 'column') {
                            e.stopPropagation();
                            highlight.onColClick?.(c);
                          }
                        }}
                        title={row[c] ?? ''}
                      >
                        {row[c] ?? ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(highlight.cols?.length || highlight.rows?.length) ? (
        <div className="bis-excel-legend">
          {Object.entries(roles).map(([col, role]) => (
            <span key={col} className={`leg role-${role}`}>
              {colLetter(Number(col))} · {roleLabel(role)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function colLetter(i: number): string {
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function roleLabel(role: string): string {
  switch (role) {
    case 'date':
      return 'Date';
    case 'desc':
      return 'Details';
    case 'out':
      return 'Out';
    case 'in':
      return 'In';
    case 'amount':
      return 'Amount';
    case 'type':
      return 'DR/CR';
    case 'balance':
      return 'Balance';
    default:
      return 'Selected';
  }
}
