'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { StockLevelRow } from '@/app/actions/inventory';
import { DateRangePicker } from '@/components/layout/date-range-picker';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

const PAGE_SIZE = 10;

export function StockLevelsList({ rows }: { rows: StockLevelRow[] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.sku, r.name, r.locationName].join(' ').toLowerCase().includes(q),
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
            placeholder="Search stock levels…"
          />
        </div>
        <div className="party-toolbar-period">
          <DateRangePicker compact />
        </div>
        <Link href="/inventory/adjustments/new">
          <Button variant="primary" type="button">
            New adjustment
          </Button>
        </Link>
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {pageRows.length === 0 ? (
            <div className="empty-state" style={{ padding: 28 }}>
              <h3>No physical stock yet</h3>
              <p>Create a physical product or post a purchase to build levels.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Location</th>
                    <th>Qty</th>
                    <th>Unit cost</th>
                    <th>Value</th>
                    <th>Reorder</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.sku}</strong>
                      </td>
                      <td>
                        <Link href={`/inventory/products/${r.productId}/edit`} style={{ color: 'inherit' }}>
                          {r.name}
                        </Link>
                      </td>
                      <td>{r.locationName}</td>
                      <td>{r.qtyOnHand}</td>
                      <td>{formatLKR(r.unitCost)}</td>
                      <td>{formatLKR(r.stockValue)}</td>
                      <td>
                        {r.belowReorder ? (
                          <StatusBadge status="blocked" />
                        ) : r.reorderLevel != null ? (
                          r.reorderLevel
                        ) : (
                          '—'
                        )}
                        {r.belowReorder ? ' low' : ''}
                      </td>
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
              <span>{filtered.length} location line(s)</span>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
