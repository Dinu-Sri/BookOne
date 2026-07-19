'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { StockLevelRow } from '@/app/actions/inventory';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

const PAGE_SIZE = 10;

type SortKey = 'sku' | 'name' | 'qtyOnHand' | 'unitCost' | 'stockValue';

export function StockLevelsList({ rows }: { rows: StockLevelRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lowOnly = searchParams.get('low') === '1';
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const lowCount = useMemo(() => rows.filter((r) => r.belowReorder).length, [rows]);
  const totalValue = useMemo(
    () => Math.round(rows.reduce((s, r) => s + r.stockValue, 0) * 100) / 100,
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (lowOnly) list = list.filter((r) => r.belowReorder);
    if (q) {
      list = list.filter((r) =>
        [r.sku, r.name, r.locationName].join(' ').toLowerCase().includes(q),
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base' }) * dir;
    });
  }, [rows, query, lowOnly, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'sku' ? 'asc' : 'desc');
    }
    setPage(1);
  }

  function setLowFilter(on: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (on) params.set('low', '1');
    else params.delete('low');
    router.replace(params.toString() ? `/inventory/levels?${params}` : '/inventory/levels');
    setPage(1);
  }

  return (
    <div className="workspace party-workspace">
      <div className="party-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="party-search-form">
          <input
            className="input party-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search SKU, name, location…"
          />
        </div>
        <Button
          variant={lowOnly ? 'primary' : 'secondary'}
          type="button"
          onClick={() => setLowFilter(!lowOnly)}
        >
          Low stock{lowCount > 0 ? ` (${lowCount})` : ''}
        </Button>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
          Stock value {formatLKR(totalValue)}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link href="/inventory/adjustments/new">
            <Button variant="secondary" type="button">
              Adjustment
            </Button>
          </Link>
          <Link href="/purchase/purchases/new">
            <Button variant="primary" type="button">
              Purchase stock
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {pageRows.length === 0 ? (
            <div className="empty-state" style={{ padding: 28 }}>
              <h3>{lowOnly ? 'No low-stock items' : 'No physical stock yet'}</h3>
              <p>
                {lowOnly
                  ? 'All physical products are above reorder level.'
                  : 'Create a physical product or post a purchase to build levels.'}
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('sku')}>
                        SKU
                      </button>
                    </th>
                    <th>
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('name')}>
                        Name
                      </button>
                    </th>
                    <th>Location</th>
                    <th>
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => toggleSort('qtyOnHand')}
                      >
                        Qty
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => toggleSort('unitCost')}
                      >
                        Last cost
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => toggleSort('stockValue')}
                      >
                        Value
                      </button>
                    </th>
                    <th>Reorder</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.sku}</strong>
                      </td>
                      <td>
                        <Link
                          href={`/inventory/products/${r.productId}/edit`}
                          style={{ color: 'inherit' }}
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td>{r.locationName}</td>
                      <td
                        style={
                          r.belowReorder
                            ? { color: 'var(--danger, #b91c1c)', fontWeight: 700 }
                            : undefined
                        }
                      >
                        {r.qtyOnHand}
                      </td>
                      <td>
                        {formatLKR(r.unitCost)}
                        <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>last purchase</div>
                      </td>
                      <td>{formatLKR(r.stockValue)}</td>
                      <td>
                        {r.belowReorder ? (
                          <>
                            <StatusBadge status="blocked" />{' '}
                            <span style={{ fontSize: 12 }}>≤ {r.reorderLevel}</span>
                          </>
                        ) : r.reorderLevel != null ? (
                          r.reorderLevel
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <Link href={`/inventory/ledger?productId=${r.productId}`}>
                          <Button variant="ghost" type="button">
                            Ledger
                          </Button>
                        </Link>
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
                {lowOnly ? ' · low stock only' : ''}
              </span>
              <div className="party-pagination-actions">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
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
              <span>
                {filtered.length} location line(s)
                {lowOnly ? ' · low stock' : ''}
              </span>
            </div>
          ) : null}
        </div>
      </Card>
      <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
        Unit cost is <strong>last purchase cost</strong> (updated when you buy physical goods). Stock
        value = qty × last cost.
      </p>
    </div>
  );
}
