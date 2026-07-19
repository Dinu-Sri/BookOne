'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Eye } from 'lucide-react';
import {
  archiveProductFromForm,
  deleteProductFromForm,
  getProductDeleteBlockers,
  restoreProductFromForm,
  type ProductRow,
} from '@/app/actions/inventory';
import { DateRangePicker } from '@/components/layout/date-range-picker';
import { pushStatusToast } from '@/components/layout/status-toast';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { ProductImageHover } from '@/components/inventory/product-image-hover';
import { ProductSnapshotDialog } from '@/components/inventory/product-snapshot';
import { Button, Card } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const PAGE_SIZE = 10;

type SortKey = 'sku' | 'name' | 'productType' | 'unitCost' | 'sellPrice' | 'qtyOnHand' | 'isActive';
type SortDir = 'asc' | 'desc';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={13} className="th-sort-icon" aria-hidden />;
  return dir === 'asc' ? (
    <ArrowUp size={13} className="th-sort-icon active" aria-hidden />
  ) : (
    <ArrowDown size={13} className="th-sort-icon active" aria-hidden />
  );
}

export function ProductListScreen({ rows: initialRows }: { rows: ProductRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get('page') ?? '1') || 1));
  const [sortKey, setSortKey] = useState<SortKey>(
    (searchParams.get('sort') as SortKey) || 'name',
  );
  const [sortDir, setSortDir] = useState<SortDir>(searchParams.get('dir') === 'desc' ? 'desc' : 'asc');
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<ProductRow | null>(null);
  const [confirm, setConfirm] = useState<null | {
    type: 'archive' | 'restore' | 'delete';
    product: ProductRow;
  }>(null);
  const [block, setBlock] = useState<null | { product: ProductRow; reasons: string[] }>(null);
  const [busy, setBusy] = useState(false);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUp: boolean } | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => setRows(initialRows), [initialRows]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if ((params.get('q') ?? '') === query) return;
      if (query) params.set('q', query);
      else params.delete('q');
      params.delete('page');
      startTransition(() => {
        router.replace(params.toString() ? `${pathname}?${params}` : pathname, { scroll: false });
      });
      setPage(1);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, pathname, router, searchParams]);

  function placeMenu(btn: HTMLButtonElement) {
    const rect = btn.getBoundingClientRect();
    const menuH = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuH && rect.top > menuH;
    const left = Math.min(Math.max(8, rect.right - 220), window.innerWidth - 228);
    setMenuPos({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left,
      openUp,
    });
  }

  function toggleMenu(id: string) {
    if (openMenuId === id) {
      setOpenMenuId(null);
      setMenuPos(null);
      return;
    }
    const btn = triggerRefs.current.get(id);
    if (btn) placeMenu(btn);
    setOpenMenuId(id);
  }

  useEffect(() => {
    if (!openMenuId) return;
    function close(e: Event) {
      const t = e.target as Node;
      if (menuPanelRef.current?.contains(t)) return;
      const btn = triggerRefs.current.get(openMenuId!);
      if (btn?.contains(t)) return;
      setOpenMenuId(null);
      setMenuPos(null);
    }
    function reposition() {
      const btn = triggerRefs.current.get(openMenuId!);
      if (!btn) return;
      placeMenu(btn);
    }
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [openMenuId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter((p) =>
        [p.sku, p.name, p.productType, p.category, p.barcode]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base' }) * dir;
    });
  }, [rows, query, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'unitCost' || key === 'sellPrice' || key === 'qtyOnHand' ? 'desc' : 'asc');
    }
  }

  const openRow = openMenuId
    ? pageRows.find((r) => r.id === openMenuId) ||
      filtered.find((r) => r.id === openMenuId) ||
      rows.find((r) => r.id === openMenuId) ||
      null
    : null;

  async function runAction() {
    if (!confirm) return;
    setBusy(true);
    const fd = new FormData();
    fd.set('id', confirm.product.id);
    try {
      if (confirm.type === 'archive') {
        await archiveProductFromForm(fd);
        pushStatusToast({ kind: 'success', message: 'Archived successfully' });
      } else if (confirm.type === 'restore') {
        await restoreProductFromForm(fd);
        pushStatusToast({ kind: 'success', message: 'Restored successfully' });
      } else {
        await deleteProductFromForm(fd);
        pushStatusToast({ kind: 'success', message: 'Deleted successfully' });
      }
      setConfirm(null);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed';
      if (confirm.type === 'delete') {
        setBlock({ product: confirm.product, reasons: [message.replace(/^Cannot delete:\s*/i, '')] });
        setConfirm(null);
      } else pushStatusToast({ kind: 'error', message });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(product: ProductRow) {
    setBusy(true);
    setOpenMenuId(null);
    setMenuPos(null);
    try {
      const blockers = await getProductDeleteBlockers(product.id);
      if (!blockers.ok) {
        setBlock({ product, reasons: blockers.reasons });
        return;
      }
      setConfirm({ type: 'delete', product });
    } finally {
      setBusy(false);
    }
  }

  function renderMenuItems(p: ProductRow) {
    const items: ReactNode[] = [
      <Link
        key="edit"
        href={`/inventory/products/${p.id}/edit`}
        className="doc-action-item"
        role="menuitem"
        onClick={() => {
          setOpenMenuId(null);
          setMenuPos(null);
        }}
      >
        Edit
      </Link>,
    ];
    if (p.productType === 'physical' || p.productType === 'stocked') {
      items.push(
        <Link
          key="ledger"
          href={`/inventory/ledger?productId=${p.id}`}
          className="doc-action-item"
          role="menuitem"
          onClick={() => {
            setOpenMenuId(null);
            setMenuPos(null);
          }}
        >
          Stock ledger
        </Link>,
        <Link
          key="levels"
          href="/inventory/levels"
          className="doc-action-item"
          role="menuitem"
          onClick={() => {
            setOpenMenuId(null);
            setMenuPos(null);
          }}
        >
          Stock levels
        </Link>,
      );
    }
    if (p.isActive === '1') {
      items.push(
        <button
          key="archive"
          type="button"
          className="doc-action-item"
          role="menuitem"
          onClick={() => {
            setOpenMenuId(null);
            setMenuPos(null);
            setConfirm({ type: 'archive', product: p });
          }}
        >
          Archive
        </button>,
      );
    } else {
      items.push(
        <button
          key="restore"
          type="button"
          className="doc-action-item"
          role="menuitem"
          onClick={() => {
            setOpenMenuId(null);
            setMenuPos(null);
            setConfirm({ type: 'restore', product: p });
          }}
        >
          Restore
        </button>,
      );
    }
    items.push(
      <button
        key="delete"
        type="button"
        className="doc-action-item danger"
        role="menuitem"
        onClick={() => onDelete(p)}
      >
        Delete
      </button>,
    );
    return items;
  }

  const menuPortal =
    mounted && openMenuId && menuPos && openRow
      ? createPortal(
          <div
            ref={menuPanelRef}
            className={`doc-action-panel doc-action-panel-fixed ${menuPos.openUp ? 'open-up' : ''}`}
            role="menu"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              transform: menuPos.openUp ? 'translateY(-100%)' : 'none',
              zIndex: 300,
              minWidth: 220,
              visibility: 'visible',
              opacity: 1,
              pointerEvents: 'auto',
            }}
          >
            {renderMenuItems(openRow)}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="workspace party-workspace">
      <div className="party-toolbar">
        <div className="party-search-form">
          <input
            className="input party-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by SKU, name, type, barcode…"
            aria-label="Search products"
          />
        </div>
        <div className="party-toolbar-period">
          <DateRangePicker compact />
        </div>
        <Link href="/inventory/products/new">
          <Button variant="primary" type="button">
            New product
          </Button>
        </Link>
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {pageRows.length === 0 ? (
            <div className="empty-state" style={{ padding: 28 }}>
              <h3>No products found</h3>
              <p>Create physical, digital, or service items for sales and stock.</p>
            </div>
          ) : (
            <div className="table-wrap table-wrap-actions">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 56 }} />
                    <th>
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('sku')}>
                        SKU
                        <SortIcon active={sortKey === 'sku'} dir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('name')}>
                        Name
                        <SortIcon active={sortKey === 'name'} dir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => toggleSort('productType')}
                      >
                        Type
                        <SortIcon active={sortKey === 'productType'} dir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => toggleSort('unitCost')}
                      >
                        Cost
                        <SortIcon active={sortKey === 'unitCost'} dir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => toggleSort('sellPrice')}
                      >
                        Price
                        <SortIcon active={sortKey === 'sellPrice'} dir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => toggleSort('qtyOnHand')}
                      >
                        Qty
                        <SortIcon active={sortKey === 'qtyOnHand'} dir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => toggleSort('isActive')}
                      >
                        Status
                        <SortIcon active={sortKey === 'isActive'} dir={sortDir} />
                      </button>
                    </th>
                    <th className="th-actions" style={{ width: 132 }} />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <ProductImageHover
                          src={p.imageUrl}
                          alt={p.name}
                          size={40}
                          zoomSize={220}
                          fallback={(p.name || '?').slice(0, 1).toUpperCase()}
                          onClick={() => setPreview(p)}
                        />
                      </td>
                      <td>
                        <strong>{p.sku}</strong>
                      </td>
                      <td>{p.name}</td>
                      <td>
                        <StatusBadge status={p.productType} />
                      </td>
                      <td>
                        {formatLKR(p.unitCost)}
                        {(p.productType === 'physical' || p.productType === 'stocked') && (
                          <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>last cost</div>
                        )}
                      </td>
                      <td>{formatLKR(p.sellPrice)}</td>
                      <td>
                        {p.productType === 'physical' || p.productType === 'stocked' ? (
                          <>
                            <strong
                              style={
                                p.reorderLevel != null && p.qtyOnHand <= p.reorderLevel
                                  ? { color: 'var(--danger, #b91c1c)' }
                                  : undefined
                              }
                            >
                              {p.qtyOnHand}
                            </strong>
                            {p.reorderLevel != null && p.qtyOnHand <= p.reorderLevel ? (
                              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger, #b91c1c)' }}>
                                low (≤{p.reorderLevel})
                              </div>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <StatusBadge status={p.isActive === '1' ? 'active' : 'inactive'} />
                      </td>
                      <td className="td-actions">
                        <div className="party-row-actions party-row-actions-inline">
                          <Button
                            variant="ghost"
                            className="icon"
                            type="button"
                            title="Quick view"
                            onClick={() => setPreview(p)}
                          >
                            <Eye size={16} />
                          </Button>
                          <div className="doc-action-menu">
                            <Button
                              variant="secondary"
                              type="button"
                              className="doc-action-trigger"
                              disabled={busy}
                              ref={(el) => {
                                if (el) triggerRefs.current.set(p.id, el);
                                else triggerRefs.current.delete(p.id);
                              }}
                              onClick={() => toggleMenu(p.id)}
                              aria-haspopup="menu"
                              aria-expanded={openMenuId === p.id}
                            >
                              Actions
                              <ChevronDown size={14} />
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 ? (
            <div className="party-pagination">
              <span>
                {filtered.length} total
                {filtered.length > PAGE_SIZE ? ` · page ${safePage} of ${totalPages}` : ''}
                {pending ? ' · searching…' : ''}
              </span>
              {filtered.length > PAGE_SIZE ? (
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
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      {menuPortal}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.type === 'delete'
            ? 'Delete product?'
            : confirm?.type === 'archive'
              ? 'Archive product?'
              : 'Restore product?'
        }
        message={
          confirm
            ? `${confirm.type === 'delete' ? 'Soft-delete' : confirm.type === 'archive' ? 'Archive' : 'Restore'} “${confirm.product.name}”?`
            : undefined
        }
        confirmLabel={
          confirm?.type === 'delete' ? 'Delete' : confirm?.type === 'archive' ? 'Archive' : 'Restore'
        }
        tone={confirm?.type === 'delete' ? 'danger' : 'primary'}
        onCancel={() => setConfirm(null)}
        onConfirm={runAction}
        busy={busy}
      />

      <ConfirmDialog
        open={Boolean(block)}
        title="Cannot delete"
        confirmLabel="OK"
        cancelLabel="Close"
        tone="primary"
        onCancel={() => setBlock(null)}
        onConfirm={() => setBlock(null)}
      >
        <p className="modal-message">
          <strong>{block?.product.name}</strong> is connected:
        </p>
        <ul className="modal-list">
          {(block?.reasons ?? []).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </ConfirmDialog>

      {preview ? <ProductSnapshotDialog product={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
