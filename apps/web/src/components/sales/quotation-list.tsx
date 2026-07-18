'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Eye } from 'lucide-react';
import {
  archiveCommercialDocument,
  convertDocumentAction,
  deleteCommercialDocument,
  getCommercialDocument,
  restoreCommercialDocument,
  type CommercialDocDetail,
  type CommercialDocRow,
} from '@/app/actions/commercial-docs';
import { pushStatusToast } from '@/components/layout/status-toast';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { QuotationSnapshotDialog } from '@/components/sales/quotation-snapshot';
import { Button, Card } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const PAGE_SIZE = 10;

export function QuotationList({ rows: initialRows }: { rows: CommercialDocRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [preview, setPreview] = useState<CommercialDocDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<null | { type: 'archive' | 'delete' | 'restore'; row: CommercialDocRow }>(
    null,
  );
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const blob = [
        r.documentNumber,
        r.taxInvoiceNumber,
        r.partyName,
        r.status,
        r.issueDate,
        r.dueDate,
        String(r.total),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query]);

  async function openView(id: string) {
    setBusy(true);
    setOpenMenuId(null);
    try {
      const detail = await getCommercialDocument(id);
      if (!detail) {
        pushStatusToast({ kind: 'error', message: 'Quotation not found' });
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
    return row.status !== 'converted' && row.status !== 'void' && row.status !== 'archived';
  }

  function canEdit(row: CommercialDocRow) {
    return row.status !== 'converted' && row.status !== 'void';
  }

  return (
    <div className="workspace party-workspace">
      <div className="party-toolbar">
        <div className="party-search-form">
          <input
            className="input party-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search quotations…"
            aria-label="Search quotations"
            autoComplete="off"
          />
        </div>
        <Link href="/sales/quotations/new">
          <Button variant="primary" type="button">
            New quotation
          </Button>
        </Link>
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {pageRows.length === 0 ? (
            <div className="empty-state" style={{ padding: 28 }}>
              <h3>{rows.length === 0 ? 'No quotations yet' : 'No matches'}</h3>
              <p style={{ marginTop: 6 }}>
                {rows.length === 0
                  ? 'Create a quotation to get started.'
                  : 'Try another search term.'}
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th style={{ width: 120 }} />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.documentNumber}</strong>
                      </td>
                      <td>{row.partyName}</td>
                      <td>{row.issueDate}</td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td>{formatLKR(row.total)}</td>
                      <td>
                        <div className="party-row-actions" ref={openMenuId === row.id ? menuRef : undefined}>
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

                          <div className={`doc-action-menu ${openMenuId === row.id ? 'open' : ''}`}>
                            <Button
                              variant="secondary"
                              type="button"
                              className="doc-action-trigger"
                              disabled={busy}
                              onClick={() =>
                                setOpenMenuId((id) => (id === row.id ? null : row.id))
                              }
                              aria-haspopup="menu"
                              aria-expanded={openMenuId === row.id}
                            >
                              Actions
                              <ChevronDown size={14} />
                            </Button>
                            {openMenuId === row.id ? (
                              <div className="doc-action-panel" role="menu">
                                {canEdit(row) ? (
                                  <Link
                                    href={`/sales/quotations/${row.id}/edit`}
                                    className="doc-action-item"
                                    role="menuitem"
                                    onClick={() => setOpenMenuId(null)}
                                  >
                                    Edit
                                  </Link>
                                ) : null}

                                {canConvert(row) ? (
                                  <form action={convertDocumentAction}>
                                    <input type="hidden" name="sourceId" value={row.id} />
                                    <input type="hidden" name="targetType" value="sales_order" />
                                    <button type="submit" className="doc-action-item" role="menuitem">
                                      Convert to order
                                    </button>
                                  </form>
                                ) : null}

                                {row.status === 'archived' ? (
                                  <button
                                    type="button"
                                    className="doc-action-item"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setConfirm({ type: 'restore', row });
                                    }}
                                  >
                                    Restore
                                  </button>
                                ) : canEdit(row) ? (
                                  <button
                                    type="button"
                                    className="doc-action-item"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setConfirm({ type: 'archive', row });
                                    }}
                                  >
                                    Archive
                                  </button>
                                ) : null}

                                {row.status !== 'converted' ? (
                                  <button
                                    type="button"
                                    className="doc-action-item danger"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setConfirm({ type: 'delete', row });
                                    }}
                                  >
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
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
                {filtered.length} quotation{filtered.length === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}
        </div>
      </Card>

      {preview ? <QuotationSnapshotDialog doc={preview} onClose={() => setPreview(null)} /> : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.type === 'delete'
            ? 'Delete quotation?'
            : confirm?.type === 'archive'
              ? 'Archive quotation?'
              : 'Restore quotation?'
        }
        message={
          confirm?.type === 'delete'
            ? `Soft-delete “${confirm.row.documentNumber}”? It will disappear from the list.`
            : confirm?.type === 'archive'
              ? `Archive “${confirm?.row.documentNumber}”? You can restore it later.`
              : `Restore “${confirm?.row.documentNumber}” to draft?`
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
