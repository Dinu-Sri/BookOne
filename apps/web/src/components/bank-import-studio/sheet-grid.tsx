'use client';

import { useEffect, useMemo, useState } from 'react';

export type SheetHighlight = {
  rows?: number[];
  cols?: number[];
  colRoles?: Record<
    number,
    'date' | 'desc' | 'out' | 'in' | 'amount' | 'type' | 'balance' | 'active'
  >;
  dimAboveRow?: number | null;
  clickMode?: 'row' | 'column' | 'none';
  onRowClick?: (absRow: number) => void;
  onColClick?: (col: number) => void;
};

const PAGE_SIZE = 12;

/**
 * Excel-like sheet with numeric column headers (Col 1…) matching step copy,
 * and row pagination so the page never needs to scroll for the grid.
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

  // Prefer showing the header row in view when highlighted
  const focusRow = highlight.rows?.[0] ?? startRow;
  const initialPage = Math.max(0, Math.floor((focusRow - startRow) / PAGE_SIZE));
  const [page, setPage] = useState(initialPage);

  useEffect(() => {
    const fr = highlight.rows?.[0];
    if (fr == null) return;
    setPage(Math.max(0, Math.floor((fr - startRow) / PAGE_SIZE)));
  }, [highlight.rows, startRow, grid.length]);

  const totalPages = Math.max(1, Math.ceil(grid.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = useMemo(() => {
    const from = safePage * PAGE_SIZE;
    return grid.slice(from, from + PAGE_SIZE).map((row, i) => ({
      abs: startRow + from + i,
      cells: row,
    }));
  }, [grid, safePage, startRow]);

  return (
    <div className="bis-excel">
      <div className="bis-excel-bar">
        <span className="bis-excel-title" title={fileLabel}>
          {fileLabel ?? 'Sheet'}
        </span>
        <span className="bis-excel-meta">
          {totalRows} rows · {colCount} cols
        </span>
      </div>

      <div className="bis-excel-scroll">
        <table className="bis-excel-table">
          <thead>
            <tr>
              <th className="bis-excel-corner">#</th>
              {Array.from({ length: colCount }, (_, c) => (
                <th
                  key={c}
                  className={`bis-excel-colhead ${colSet.has(c) ? 'hl' : ''} ${
                    roles[c] ? `role-${roles[c]}` : ''
                  }`}
                  onClick={() => {
                    if (highlight.clickMode === 'column') highlight.onColClick?.(c);
                  }}
                >
                  {c + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ abs, cells }) => {
              const isHeader = rowSet.has(abs);
              const dim = highlight.dimAboveRow != null && abs < highlight.dimAboveRow;
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
                        className={`${colHl ? 'col-hl' : ''} ${role ? `role-${role}` : ''}`}
                        onClick={(e) => {
                          if (highlight.clickMode === 'column') {
                            e.stopPropagation();
                            highlight.onColClick?.(c);
                          }
                        }}
                        title={cells[c] ?? ''}
                      >
                        {cells[c] ?? ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bis-excel-pager">
        <button
          type="button"
          className="bis-pager-btn"
          disabled={safePage <= 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          ‹ Prev
        </button>
        <span className="bis-pager-label">
          Rows {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, grid.length)}
          {' · '}
          page {safePage + 1}/{totalPages}
        </span>
        <button
          type="button"
          className="bis-pager-btn"
          disabled={safePage >= totalPages - 1}
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        >
          Next ›
        </button>
      </div>

      {highlight.cols?.length || highlight.rows?.length ? (
        <div className="bis-excel-legend">
          {Object.entries(roles).map(([col, role]) => (
            <span key={col} className={`leg role-${role}`}>
              Col {Number(col) + 1} · {roleLabel(role)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
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
