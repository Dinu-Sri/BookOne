'use client';

import { useMemo, useState } from 'react';
import type { StockMovementRow } from '@/app/actions/inventory';
import { DateRangePicker } from '@/components/layout/date-range-picker';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

const PAGE_SIZE = 10;

export function StockLedgerList({ rows }: { rows: StockMovementRow[] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.sku, r.productName, r.movementType, r.memo].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="workspace party-workspace">
      <div className="party-toolbar">
        <div className="party-search-form">
          <input
            className="input party-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search ledger…"
          />
        </div>
        <div className="party-toolbar-period">
          <DateRangePicker compact />
        </div>
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {pageRows.length === 0 ? (
            <div className="empty-state" style={{ padding: 28 }}>
              <h3>No stock movements</h3>
              <p>Sales, purchases, transfers, and adjustments will appear here.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit cost</th>
                    <th>Memo</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.movementDate}</td>
                      <td>
                        <StatusBadge status={r.movementType} />
                      </td>
                      <td>
                        <strong>{r.sku}</strong>
                      </td>
                      <td>{r.productName}</td>
                      <td style={r.quantity < 0 ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                        {r.quantity}
                      </td>
                      <td>{formatLKR(r.unitCost)}</td>
                      <td>{r.memo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > PAGE_SIZE ? (
            <div className="party-pagination">
              <span>
                {filtered.length} total · page {safePage} of {totalPages}
              </span>
              <div className="party-pagination-actions">
                <Button variant="secondary" type="button" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : filtered.length > 0 ? (
            <div className="party-pagination">
              <span>{filtered.length} movement(s)</span>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
