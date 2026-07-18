'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Eye } from 'lucide-react';
import {
  archiveCommercialDocument,
  convertDocumentAction,
  deleteCommercialDocument,
  getCommercialDocument,
  restoreCommercialDocument,
  type CommercialDocDetail,
  type CommercialDocRow,
} from '@/app/actions/commercial-docs';
import { DateRangePicker } from '@/components/layout/date-range-picker';
import { pushStatusToast } from '@/components/layout/status-toast';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { QuotationSnapshotDialog } from '@/components/sales/quotation-snapshot';
import { Button, Card } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const PAGE_SIZE = 10;

type SortKey = 'documentNumber' | 'partyName' | 'issueDate' | 'status' | 'total';
type SortDir = 'asc' | 'desc';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={13} className="th-sort-icon" aria-hidden />;
  return dir === 'asc' ? (
    <ArrowUp size={13} className="th-sort-icon active" aria-hidden />
  ) : (
    <ArrowDown size={13} className="th-sort-icon active" aria-hidden />
  );
}

export type CommercialListConfig = {
  title: string;
  searchPlaceholder: string;
  newHref: string;
  newLabel: string;
  editHref?: (id: string) => string | null;
  convertTo?: 'sales_order' | 'sales_invoice' | 'purchase' | 'vendor_bill';
  convertLabel?: string;
  showTaxCols?: boolean;
  printHref?: (id: string) => string | null;
};

export function CommercialDocumentList({
  rows: initialRows,
  config,
}: {
  rows: CommercialDocRow[];
  config: CommercialListConfig;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get('from') ?? '';
  const toParam = searchParams.get('to') ?? '';

  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get('page') ?? '1') || 1));
  const [sortKey, setSortKey] = useState<SortKey>(
    (searchParams.get('sort') as SortKey) || 'issueDate',
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    searchParams.get('dir') === 'asc' ? 'asc' : 'desc',
  );

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUp: boolean } | null>(
    null,
  );
  const [preview, setPreview] = useState<CommercialDocDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<
    null | { type: 'archive' | 'delete' | 'restore'; row: CommercialDocRow }
  >(null);
  const [mounted, setMounted] = useState(false);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => setRows(initialRows), [initialRows]);

  // Debounce search → URL
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

  // Close action menu on outside click / scroll / resize
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
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', reposition);
    };
  }, [openMenuId]);

  function placeMenu(btn: HTMLButtonElement) {
    const rect = btn.getBoundingClientRect();
    const panelW = 220;
    const panelH = 250;
    const spaceBelow = window.innerHeight - rect.bottom;
    // Prefer open down; only flip up when not enough space below AND enough above
    const openUp = spaceBelow < panelH && rect.top > panelH;
    const top = openUp ? rect.top - 4 : rect.bottom + 4;
    let left = rect.right - panelW;
    left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8));
    setMenuPos({ top, left, openUp });
  }

  function toggleMenu(rowId: string) {
    if (openMenuId === rowId) {
      setOpenMenuId(null);
      setMenuPos(null);
      return;
    }
    const btn = triggerRefs.current.get(rowId);
    setOpenMenuId(rowId);
    // Place after state flush so panel can measure; first paint uses estimate
    if (btn) {
      placeMenu(btn);
      requestAnimationFrame(() => placeMenu(btn));
    }
  }

  const filtered = useMemo(() => {
    let list = rows;

    // Duration filter on issue date (YYYY-MM-DD)
    if (fromParam) list = list.filter((r) => r.issueDate >= fromParam);
    if (toParam) list = list.filter((r) => r.issueDate <= toParam);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const blob = [
          r.documentNumber,
          r.taxInvoiceNumber,
          r.partyName,
          r.status,
          r.issueDate,
          r.dueDate,
          String(r.total),
          String(r.subtotal),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    const sorted = [...list].sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      switch (sortKey) {
        case 'documentNumber':
          av = a.documentNumber.toLowerCase();
          bv = b.documentNumber.toLowerCase();
          break;
        case 'partyName':
          av = a.partyName.toLowerCase();
          bv = b.partyName.toLowerCase();
          break;
        case 'issueDate':
          av = a.issueDate;
          bv = b.issueDate;
          break;
        case 'status':
          av = a.status.toLowerCase();
          bv = b.status.toLowerCase();
          break;
        case 'total':
          av = a.total;
          bv = b.total;
          break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return sorted;
  }, [rows, query, fromParam, toParam, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, fromParam, toParam, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'issueDate' || key === 'total' ? 'desc' : 'asc');
    }
  }

  async function openView(id: string) {
    setBusy(true);
    setOpenMenuId(null);
    setMenuPos(null);
    try {
      const detail = await getCommercialDocument(id);
      if (!detail) {
        pushStatusToast({ kind: 'error', message: `${config.title} not found` });
        return;
      }
      setPreview(detail);
    } catch (e) {
      pushStatusToast({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Could not load quotation',
      });
    } finally {
      setBusy(false);
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.type === 'archive') {
        const res = await archiveCommercialDocument(confirm.row.id);
        if (!res.ok) throw new Error(res.error);
        setRows((prev) =>
          prev.map((r) => (r.id === confirm.row.id ? { ...r, status: 'archived' } : r)),
        );
        pushStatusToast({ kind: 'success', message: 'Archived successfully' });
      } else if (confirm.type === 'restore') {
        const res = await restoreCommercialDocument(confirm.row.id);
        if (!res.ok) throw new Error(res.error);
        setRows((prev) =>
          prev.map((r) => (r.id === confirm.row.id ? { ...r, status: 'draft' } : r)),
        );
        pushStatusToast({ kind: 'success', message: 'Restored successfully' });
      } else {
        const res = await deleteCommercialDocument(confirm.row.id);
        if (!res.ok) throw new Error(res.error);
        setRows((prev) => prev.filter((r) => r.id !== confirm.row.id));
        pushStatusToast({ kind: 'success', message: 'Deleted successfully' });
      }
      setConfirm(null);
      startTransition(() => router.refresh());
    } catch (e) {
      pushStatusToast({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Action failed',
      });
    } finally {
      setBusy(false);
    }
  }

  function canConvert(row: CommercialDocRow) {
    return (
      row.status !== 'converted' &&
      row.status !== 'void' &&
      row.status !== 'archived' &&
      row.status !== 'fully_invoiced'
    );
  }

  function canEdit(row: CommercialDocRow) {
    return row.status !== 'converted' && row.status !== 'void' && row.status !== 'fully_invoiced';
  }

  // Prefer pageRows so open menu always resolves even if list filtered/sorted
  const openRow = openMenuId
    ? pageRows.find((r) => r.id === openMenuId) ||
      filtered.find((r) => r.id === openMenuId) ||
      rows.find((r) => r.id === openMenuId) ||
      null
    : null;

  function renderMenuItems(row: CommercialDocRow) {
    const items: ReactNode[] = [];
    const editTo = config.editHref?.(row.id);
    if (canEdit(row) && editTo) {
      items.push(
        <Link
          key="edit"
          href={editTo}
          className="doc-action-item"
          role="menuitem"
          onClick={() => {
            setOpenMenuId(null);
            setMenuPos(null);
          }}
        >
          Edit
        </Link>,
      );
    }
    if (canConvert(row) && config.convertTo) {
      items.push(
        <form key="convert" action={convertDocumentAction}>
          <input type="hidden" name="sourceId" value={row.id} />
          <input type="hidden" name="targetType" value={config.convertTo} />
          <button type="submit" className="doc-action-item" role="menuitem">
            {config.convertLabel ?? 'Convert'}
          </button>
        </form>,
      );
    }
    const printTo = config.printHref?.(row.id);
    if (printTo) {
      items.push(
        <Link
          key="print"
          href={printTo}
          className="doc-action-item"
          role="menuitem"
          onClick={() => {
            setOpenMenuId(null);
            setMenuPos(null);
          }}
        >
          Print
        </Link>,
      );
    }
    if (row.status === 'archived') {
      items.push(
        <button
          key="restore"
          type="button"
          className="doc-action-item"
          role="menuitem"
          onClick={() => {
            setOpenMenuId(null);
            setMenuPos(null);
            setConfirm({ type: 'restore', row });
          }}
        >
          Restore
        </button>,
      );
    } else if (canEdit(row)) {
      items.push(
        <button
          key="archive"
          type="button"
          className="doc-action-item"
          role="menuitem"
          onClick={() => {
            setOpenMenuId(null);
            setMenuPos(null);
            setConfirm({ type: 'archive', row });
          }}
        >
          Archive
        </button>,
      );
    }
    if (row.status !== 'converted') {
      items.push(
        <button
          key="delete"
          type="button"
          className="doc-action-item danger"
          role="menuitem"
          onClick={() => {
            setOpenMenuId(null);
            setMenuPos(null);
            setConfirm({ type: 'delete', row });
          }}
        >
          Delete
        </button>,
      );
    }
    if (items.length === 0) {
      items.push(
        <div key="none" className="doc-action-item doc-action-item-muted" role="menuitem">
          No actions available
        </div>,
      );
    }
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
            placeholder={config.searchPlaceholder}
            aria-label={config.searchPlaceholder}
            autoComplete="off"
          />
        </div>
        <div className="party-toolbar-period">
          <DateRangePicker compact />
        </div>
        <Link href={config.newHref}>
          <Button variant="primary" type="button">
            {config.newLabel}
          </Button>
        </Link>
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {pageRows.length === 0 ? (
            <div className="empty-state" style={{ padding: 28 }}>
              <h3>{rows.length === 0 ? `No ${config.title.toLowerCase()} yet` : 'No matches'}</h3>
              <p style={{ marginTop: 6 }}>
                {rows.length === 0
                  ? `Use ${config.newLabel} to get started.`
                  : 'Try another search or date range.'}
              </p>
            </div>
          ) : (
            <div className="table-wrap table-wrap-actions">
              <table className="table">
                <thead>
                  <tr>
                    <th>
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('documentNumber')}>
                        Number
                        <SortIcon active={sortKey === 'documentNumber'} dir={sortDir} />
                      </button>
                    </th>
                    {config.showTaxCols ? <th>Kind</th> : null}
                    <th>
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('partyName')}>
                        Customer
                        <SortIcon active={sortKey === 'partyName'} dir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('issueDate')}>
                        Date
                        <SortIcon active={sortKey === 'issueDate'} dir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('status')}>
                        Status
                        <SortIcon active={sortKey === 'status'} dir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('total')}>
                        Total
                        <SortIcon active={sortKey === 'total'} dir={sortDir} />
                      </button>
                    </th>
                    <th className="th-actions" style={{ width: 132 }} />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.taxInvoiceNumber || row.documentNumber}</strong>
                        {row.taxInvoiceNumber ? (
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{row.documentNumber}</div>
                        ) : null}
                      </td>
                      {config.showTaxCols ? (
                        <td>
                          {row.invoiceKind === 'tax_invoice' ? 'TAX' : 'Commercial'}
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                            {row.saleChannel === 'export' ? 'Export' : 'Local'}
                          </div>
                        </td>
                      ) : null}
                      <td>{row.partyName}</td>
                      <td>{row.issueDate}</td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td>{formatLKR(row.total)}</td>
                      <td className="td-actions">
                        <div className="party-row-actions party-row-actions-inline">
                          <Button
                            variant="ghost"
                            className="icon"
                            type="button"
                            aria-label={`View ${row.documentNumber}`}
                            title="View"
                            disabled={busy}
                            onClick={() => openView(row.id)}
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
                                if (el) triggerRefs.current.set(row.id, el);
                                else triggerRefs.current.delete(row.id);
                              }}
                              onClick={() => toggleMenu(row.id)}
                              aria-haspopup="menu"
                              aria-expanded={openMenuId === row.id}
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

          {filtered.length > PAGE_SIZE ? (
            <div className="party-pagination">
              <span>
                {filtered.length} total · page {safePage} of {totalPages}
                {pending ? ' · refreshing…' : ''}
              </span>
              <div className="party-pagination-actions">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(safePage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : filtered.length > 0 ? (
            <div className="party-pagination">
              <span>
                {filtered.length} {config.title.toLowerCase()}
                {filtered.length === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}
        </div>
      </Card>

      {menuPortal}

      {preview ? <QuotationSnapshotDialog doc={preview} onClose={() => setPreview(null)} /> : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.type === 'delete'
            ? `Delete ${config.title.toLowerCase()}?`
            : confirm?.type === 'archive'
              ? `Archive ${config.title.toLowerCase()}?`
              : `Restore ${config.title.toLowerCase()}?`
        }
        message={
          confirm?.type === 'delete'
            ? `Soft-delete “${confirm.row.documentNumber}”? It will disappear from the list.`
            : confirm?.type === 'archive'
              ? `Archive “${confirm?.row.documentNumber}”? You can restore it later.`
              : `Restore “${confirm?.row.documentNumber}”?`
        }
        confirmLabel={
          confirm?.type === 'delete' ? 'Delete' : confirm?.type === 'archive' ? 'Archive' : 'Restore'
        }
        tone={confirm?.type === 'delete' ? 'danger' : 'primary'}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
        busy={busy}
      />
    </div>
  );
}
