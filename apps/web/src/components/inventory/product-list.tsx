'use client';

import Link from 'next/link';
import { Eye } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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

export function ProductListScreen({ rows: initialRows }: { rows: ProductRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get('page') ?? '1') || 1));
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<ProductRow | null>(null);
  const [confirm, setConfirm] = useState<null | { type: 'archive' | 'restore' | 'delete'; product: ProductRow }>(null);
  const [block, setBlock] = useState<null | { product: ProductRow; reasons: string[] }>(null);
  const [busy, setBusy] = useState(false);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) =>
      [p.sku, p.name, p.productType, p.category, p.barcode].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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

  return (
    <div className="workspace party-workspace">
      <div className="party-toolbar">
        <div className="party-search-form">
          <input
            className="input party-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            aria-label="Search"
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
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 56 }} />
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Cost</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Status</th>
                    <th />
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
                      <td>{formatLKR(p.unitCost)}</td>
                      <td>{formatLKR(p.sellPrice)}</td>
                      <td>{p.productType === 'physical' ? p.qtyOnHand : '—'}</td>
                      <td>
                        <StatusBadge status={p.isActive === '1' ? 'active' : 'inactive'} />
                      </td>
                      <td>
                        <div className="party-row-actions">
                          <Button variant="ghost" className="icon" type="button" title="Quick view" onClick={() => setPreview(p)}>
                            <Eye size={16} />
                          </Button>
                          <Link href={`/inventory/products/${p.id}/edit`}>
                            <Button variant="secondary" type="button">
                              Edit
                            </Button>
                          </Link>
                          {p.isActive === '1' ? (
                            <Button variant="ghost" type="button" onClick={() => setConfirm({ type: 'archive', product: p })}>
                              Archive
                            </Button>
                          ) : (
                            <Button variant="ghost" type="button" onClick={() => setConfirm({ type: 'restore', product: p })}>
                              Restore
                            </Button>
                          )}
                          <Button variant="ghost" type="button" onClick={() => onDelete(p)}>
                            Delete
                          </Button>
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
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.type === 'delete' ? 'Delete product?' : confirm?.type === 'archive' ? 'Archive product?' : 'Restore product?'}
        message={
          confirm
            ? `${confirm.type === 'delete' ? 'Soft-delete' : confirm.type === 'archive' ? 'Archive' : 'Restore'} “${confirm.product.name}”?`
            : undefined
        }
        confirmLabel={confirm?.type === 'delete' ? 'Delete' : confirm?.type === 'archive' ? 'Archive' : 'Restore'}
        tone={confirm?.type === 'delete' ? 'danger' : 'primary'}
        onCancel={() => setConfirm(null)}
        onConfirm={runAction}
        busy={busy}
      />

      <ConfirmDialog open={Boolean(block)} title="Cannot delete" confirmLabel="OK" cancelLabel="Close" tone="primary" onCancel={() => setBlock(null)} onConfirm={() => setBlock(null)}>
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
