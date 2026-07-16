'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  archivePartyFromForm,
  deletePartyFromForm,
  getPartyDeleteBlockers,
  restorePartyFromForm,
  type PartyListFilter,
  type PartyRow,
} from '@/app/actions/parties';
import { DateRangePicker } from '@/components/layout/date-range-picker';
import { pushStatusToast } from '@/components/layout/status-toast';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const PAGE_SIZE = 10;

function sortHref(
  basePath: string,
  searchParams: URLSearchParams,
  column: string,
  currentSort: string,
  currentDir: string,
) {
  const params = new URLSearchParams(searchParams.toString());
  const nextDir = currentSort === column && currentDir === 'asc' ? 'desc' : 'asc';
  params.set('sort', column);
  params.set('dir', nextDir);
  params.delete('page');
  const s = params.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export function PartyListScreen({
  role,
  rows: initialRows,
  filter,
}: {
  role: 'customer' | 'vendor';
  rows: PartyRow[];
  filter: PartyListFilter;
}) {
  const basePath = role === 'customer' ? '/parties/customers' : '/parties/vendors';
  const title = role === 'customer' ? 'Customers' : 'Vendors';
  const newHref = `${basePath}/new`;
  const newLabel = role === 'customer' ? 'New customer' : 'New vendor';

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sort = filter.sort ?? 'name';
  const dir = filter.dir ?? 'asc';
  const pageFromUrl = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const [query, setQuery] = useState(filter.q ?? '');
  const [page, setPage] = useState(pageFromUrl);
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();

  const [confirm, setConfirm] = useState<
    | null
    | { type: 'archive' | 'restore' | 'delete'; party: PartyRow }
  >(null);
  const [block, setBlock] = useState<null | { party: PartyRow; reasons: string[] }>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  // Live search → update URL (debounced)
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const current = params.get('q') ?? '';
      if (query === current) return;
      if (query) params.set('q', query);
      else params.delete('q');
      params.delete('page');
      const next = params.toString();
      startTransition(() => {
        router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
      });
      setPage(1);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, pathname, router, searchParams]);

  // Client-side filter for instant feel while server refreshes
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) => {
      const blob = [
        p.name,
        p.displayName,
        p.code,
        p.phoneMobile,
        p.phone,
        p.email,
        p.tin,
        p.taxId,
        p.city,
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

  function goPage(next: number) {
    const p = Math.min(totalPages, Math.max(1, next));
    setPage(p);
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete('page');
    else params.set('page', String(p));
    const s = params.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  async function runAction() {
    if (!confirm) return;
    setBusy(true);
    const fd = new FormData();
    fd.set('id', confirm.party.id);
    fd.set('noRedirect', '1');
    try {
      if (confirm.type === 'archive') {
        await archivePartyFromForm(fd);
        pushStatusToast({ kind: 'success', message: 'Archived successfully' });
      } else if (confirm.type === 'restore') {
        await restorePartyFromForm(fd);
        pushStatusToast({ kind: 'success', message: 'Restored successfully' });
      } else {
        await deletePartyFromForm(fd);
        pushStatusToast({ kind: 'success', message: 'Deleted successfully' });
      }
      setConfirm(null);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed';
      if (confirm.type === 'delete' && message.toLowerCase().includes('cannot delete')) {
        setBlock({
          party: confirm.party,
          reasons: confirm.party.deleteReasons.length
            ? confirm.party.deleteReasons
            : [message.replace(/^Cannot delete:\s*/i, '')],
        });
        setConfirm(null);
      } else {
        pushStatusToast({ kind: 'error', message });
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteClick(party: PartyRow) {
    setBusy(true);
    try {
      const blockers = await getPartyDeleteBlockers(party.id);
      if (!blockers.ok) {
        setBlock({
          party,
          reasons:
            blockers.reasons.length > 0
              ? blockers.reasons
              : party.deleteReasons.length > 0
                ? party.deleteReasons
                : ['This party is connected to other records in the system.'],
        });
        return;
      }
      setConfirm({ type: 'delete', party });
    } catch (error) {
      pushStatusToast({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not check delete eligibility.',
      });
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
            placeholder={`Search ${title.toLowerCase()}…`}
            aria-label="Search"
            autoComplete="off"
          />
        </div>
        <div className="party-toolbar-period">
          <DateRangePicker compact />
        </div>
        <Link href={newHref}>
          <Button variant="primary" type="button">
            {newLabel}
          </Button>
        </Link>
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {pageRows.length === 0 ? (
            <div className="empty-state" style={{ padding: 28 }}>
              <h3>No {title.toLowerCase()} found</h3>
              <p>{query ? 'Try a different search.' : `Use ${newLabel} to add the first record.`}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>
                      <Link
                        href={sortHref(basePath, searchParams, 'code', sort, dir)}
                        style={{ color: 'inherit', textDecoration: 'none' }}
                      >
                        Code{sort === 'code' ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </Link>
                    </th>
                    <th>
                      <Link
                        href={sortHref(basePath, searchParams, 'name', sort, dir)}
                        style={{ color: 'inherit', textDecoration: 'none' }}
                      >
                        Name{sort === 'name' ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </Link>
                    </th>
                    <th>Phone</th>
                    <th>
                      <Link
                        href={sortHref(basePath, searchParams, 'balance', sort, dir)}
                        style={{ color: 'inherit', textDecoration: 'none' }}
                      >
                        Balance{sort === 'balance' ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </Link>
                    </th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => {
                    const balance = role === 'customer' ? p.openReceivable : p.openPayable;
                    const editHref = `${basePath}/${p.id}/edit`;
                    return (
                      <tr key={p.id}>
                        <td>{p.code ?? '—'}</td>
                        <td>
                          <Link href={editHref} style={{ color: 'inherit', textDecoration: 'none' }}>
                            <strong>{p.displayName || p.name}</strong>
                          </Link>
                          {p.isCustomer && p.isVendor ? (
                            <span className="badge info" style={{ marginLeft: 8, fontSize: 11 }}>
                              Both
                            </span>
                          ) : null}
                        </td>
                        <td>{p.phoneMobile || p.phone || '—'}</td>
                        <td style={balance > 0 ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                          {formatLKR(balance)}
                        </td>
                        <td>
                          <StatusBadge status={p.status} />
                        </td>
                        <td>
                          <div className="party-row-actions">
                            <Link href={editHref}>
                              <Button variant="secondary" type="button">
                                Edit
                              </Button>
                            </Link>
                            {p.status === 'active' ? (
                              <Button
                                variant="ghost"
                                type="button"
                                onClick={() => setConfirm({ type: 'archive', party: p })}
                              >
                                Archive
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                type="button"
                                onClick={() => setConfirm({ type: 'restore', party: p })}
                              >
                                Restore
                              </Button>
                            )}
                            <Button variant="ghost" type="button" onClick={() => onDeleteClick(p)}>
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > PAGE_SIZE ? (
            <div className="party-pagination">
              <span>
                {filtered.length} total · page {safePage} of {totalPages}
                {pending ? ' · searching…' : ''}
              </span>
              <div className="party-pagination-actions">
                <Button variant="secondary" type="button" disabled={safePage <= 1} onClick={() => goPage(safePage - 1)}>
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => goPage(safePage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : filtered.length > 0 ? (
            <div className="party-pagination">
              <span>
                {filtered.length} record{filtered.length === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}
        </div>
      </Card>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.type === 'delete'
            ? 'Delete party?'
            : confirm?.type === 'archive'
              ? 'Archive party?'
              : 'Restore party?'
        }
        message={
          confirm?.type === 'delete'
            ? `Soft-delete “${confirm.party.displayName || confirm.party.name}”? This cannot be undone from the list without admin tools.`
            : confirm?.type === 'archive'
              ? `Archive “${confirm?.party.displayName || confirm?.party.name}”? They will be hidden from active pickers.`
              : `Restore “${confirm?.party.displayName || confirm?.party.name}” to active?`
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
          <strong>{block?.party.displayName || block?.party.name}</strong> is connected to other records:
        </p>
        <ul className="modal-list">
          {(block?.reasons ?? []).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p className="modal-message" style={{ marginTop: 8 }}>
          Archive the party instead if you want to hide it from pickers.
        </p>
      </ConfirmDialog>
    </div>
  );
}
