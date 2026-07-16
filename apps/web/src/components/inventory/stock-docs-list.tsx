'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { StockDocRow } from '@/app/actions/inventory';
import { DateRangePicker } from '@/components/layout/date-range-picker';
import { StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

const PAGE_SIZE = 10;

export function StockDocsList({
  docType,
  rows,
}: {
  docType: 'transfer' | 'adjustment';
  rows: StockDocRow[];
}) {
  const title = docType === 'transfer' ? 'transfers' : 'adjustments';
  const newHref = docType === 'transfer' ? '/inventory/transfers/new' : '/inventory/adjustments/new';
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.documentNumber, r.reason, r.status].filter(Boolean).join(' ').toLowerCase().includes(q),
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
            placeholder={`Search ${title}…`}
          />
        </div>
        <div className="party-toolbar-period">
          <DateRangePicker compact />
        </div>
        <Link href={newHref}>
          <Button variant="primary" type="button">
            New {docType}
          </Button>
        </Link>
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {pageRows.length === 0 ? (
            <div className="empty-state" style={{ padding: 28 }}>
              <h3>No {title} yet</h3>
              <p>Physical products only — digital and service items cannot be stock-moved.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Date</th>
                    <th>Lines</th>
                    <th>Status</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.documentNumber}</strong>
                      </td>
                      <td>{r.docDate}</td>
                      <td>{r.lineCount}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td>{r.reason ?? '—'}</td>
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
          ) : null}
        </div>
      </Card>
    </div>
  );
}
