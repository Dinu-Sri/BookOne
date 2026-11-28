'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Eye } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { withFormPending } from '@/components/ui/form-busy';
import { SearchField } from '@/components/ui/text-field';
import { SelectField } from '@/components/ui/select-field';
import { menuPosition, type MenuPosition } from '@/components/ui/menu-position';
import { archiveCompanyAccount, exportChartCsv, reactivateCompanyAccount } from '@/app/actions/chart-of-accounts';
import { classLabel, statusLabel, subtypeLabel } from '@/lib/coa-labels';

export type CoaRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  normalSide: string;
  balance: number;
  subtype?: string | null;
  isGroup?: string | null;
  isSystem?: string | null;
  isActive?: string | null;
  liquidity?: string | null;
  controlRole?: string | null;
  parentCode?: string | null;
  version?: number;
  description?: string | null;
  institution?: string | null;
  lastDigits?: string | null;
};

const PAGE_SIZE = 10;
const ROOTS = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;
type SortKey = 'code' | 'name' | 'type' | 'subtype' | 'status' | 'balance';
type SortDir = 'asc' | 'desc';

function money(value: number, currency: string) {
  const sign = value < 0 ? '-' : '';
  return `${sign}${currency} ${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function typeTone(type: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (type) {
    case 'asset':
      return 'info';
    case 'liability':
      return 'warning';
    case 'equity':
      return 'neutral';
    case 'revenue':
      return 'success';
    case 'expense':
      return 'danger';
    default:
      return 'neutral';
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={13} className="th-sort-icon" aria-hidden />;
  return dir === 'asc' ? (
    <ArrowUp size={13} className="th-sort-icon active" aria-hidden />
  ) : (
    <ArrowDown size={13} className="th-sort-icon active" aria-hidden />
  );
}

function archiveBlockedReason(row: CoaRow): string | null {
  if (row.isSystem === '1') return 'System control accounts stay on the chart. Archive is not offered here.';
  if (row.isGroup === '1') return 'Group headings with children cannot be archived until children move.';
  return null;
}

export function CoaManager({
  accounts,
  currency,
  canWrite,
  focus,
}: {
  accounts: CoaRow[];
  currency: string;
  canWrite: boolean;
  focus?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(focus === 'bank' ? 'bank' : '');
  const [root, setRoot] = useState<string>('all');
  const [status, setStatus] = useState<'active' | 'archived' | 'all'>(focus === 'archived' ? 'archived' : 'active');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sortKey, setSortKey] = useState<SortKey>('code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const [mounted, setMounted] = useState(false);
  const [confirm, setConfirm] = useState<null | { type: 'archive' | 'reactivate'; row: CoaRow }>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => setMounted(true), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = accounts.filter((row) => {
      const archived = row.isActive === '0';
      if (status === 'active' && archived) return false;
      if (status === 'archived' && !archived) return false;
      if (root !== 'all' && row.type !== root) return false;
      if (!q) return true;
      return (
        row.code.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        subtypeLabel(row.subtype).toLowerCase().includes(q) ||
        classLabel(row.type).toLowerCase().includes(q) ||
        (row.liquidity ?? '').toLowerCase().includes(q)
      );
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av =
        sortKey === 'status'
          ? statusLabel(a.isActive)
          : sortKey === 'subtype'
            ? subtypeLabel(a.subtype)
            : sortKey === 'type'
              ? classLabel(a.type)
              : String(a[sortKey] ?? '');
      const bv =
        sortKey === 'status'
          ? statusLabel(b.isActive)
          : sortKey === 'subtype'
            ? subtypeLabel(b.subtype)
            : sortKey === 'type'
              ? classLabel(b.type)
              : String(b[sortKey] ?? '');
      if (sortKey === 'balance') return (a.balance - b.balance) * dir;
      return av.localeCompare(bv, undefined, { numeric: true }) * dir;
    });
    return rows;
  }, [accounts, query, root, status, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, root, status, sortKey, sortDir]);

  useEffect(() => {
    if (!openMenuId) return;
    function onScroll() {
      setOpenMenuId(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenuId(null);
    }
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('keydown', onKey);
    };
  }, [openMenuId]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'balance' ? 'desc' : 'asc');
    }
  }

  function archive(row: CoaRow) {
    setError(null);
    setMessage(null);
    start(() => {
      void withFormPending(async () => {
        const result = await archiveCompanyAccount(row.id, row.version ?? 1);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(`Archived ${row.code} ${row.name}.`);
        router.refresh();
      });
    });
  }

  function reactivate(row: CoaRow) {
    setError(null);
    setMessage(null);
    start(() => {
      void withFormPending(async () => {
        const result = await reactivateCompanyAccount(row.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(`Reactivated ${row.code} ${row.name}.`);
        router.refresh();
      });
    });
  }

  function exportCsv() {
    setError(null);
    start(() => {
      void withFormPending(async () => {
        const result = await exportChartCsv();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chart-of-accounts.csv';
        a.click();
        URL.revokeObjectURL(url);
        setMessage('Chart exported.');
      });
    });
  }

  const openRow = pageRows.find((row) => row.id === openMenuId) ?? filtered.find((row) => row.id === openMenuId);

  const menuPortal =
    mounted && openMenuId && menuPos && openRow
      ? createPortal(
          <div
            className={`doc-action-panel doc-action-panel-fixed ${menuPos.openUp ? 'open-up' : ''}`}
            role="menu"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              transform: menuPos.openUp ? 'translateY(-100%)' : 'none',
              zIndex: 300,
              minWidth: 220,
            }}
          >
            {(() => {
              const items = [];
              const blocked = archiveBlockedReason(openRow);
              if (canWrite && openRow.isActive !== '0') {
                if (blocked) {
                  items.push(
                    <div key="blocked" className="doc-action-item doc-action-item-muted" role="menuitem">
                      {blocked}
                    </div>,
                  );
                } else {
                  items.push(
                    <button
                      key="archive"
                      type="button"
                      className="doc-action-item"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuId(null);
                        setConfirm({ type: 'archive', row: openRow });
                      }}
                    >
                      Archive
                    </button>,
                  );
                }
              }
              if (canWrite && openRow.isActive === '0') {
                items.push(
                  <button
                    key="restore"
                    type="button"
                    className="doc-action-item"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenuId(null);
                      setConfirm({ type: 'reactivate', row: openRow });
                    }}
                  >
                    Reactivate
                  </button>,
                );
              }
              if (items.length === 0) {
                items.push(
                  <div key="none" className="doc-action-item doc-action-item-muted" role="menuitem">
                    {canWrite ? 'No actions available' : 'View only — archive needs Accounts write.'}
                  </div>,
                );
              }
              return items;
            })()}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="workspace party-workspace">
      <header className="ux-head">
        <div className="ux-head-text">
          <div>
            <h1 className="page-title">Chart of Accounts</h1>
            <p>
              The accounts your money is sorted into: cash and banks, what customers owe you, what you owe, income and
              expenses. Renaming an account changes reports; past entries keep their lines.
            </p>
          </div>
        </div>
        {canWrite ? (
          <div className="ux-head-actions">
            <Link href="/accounts/new" className="button primary">
              New account
            </Link>
          </div>
        ) : null}
      </header>
      <div className="coa-toolbar">
        <div className="coa-filters">
          <SearchField
            id="coa-search"
            label="Search"
            value={query}
            onChange={setQuery}
            placeholder="Search by code, name or class"
            showLabel
            className="coa-search-field"
          />
          <SelectField
            id="coa-root"
            label="Class"
            value={root}
            onChange={setRoot}
            className="party-toolbar-filter"
            options={[{ value: 'all', label: 'All classes' }, ...ROOTS.map((item) => ({ value: item, label: classLabel(item) }))]}
          />
          <SelectField
            id="coa-status"
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as typeof status)}
            className="party-toolbar-filter"
            options={[
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        <div className="coa-secondary">
          {canWrite ? (
            <Link href="/accounts/opening" className="button secondary">
              Opening balances
            </Link>
          ) : null}
          <Link href="/accounts/months" className="button secondary">
            Closed months
          </Link>
          {canWrite ? (
            <Link href="/accounts/import" className="button secondary">
              Import CSV
            </Link>
          ) : null}
          <Button onClick={exportCsv} disabled={pending}>
            Export CSV
          </Button>
        </div>
      </div>
      <Card>
        <div className="card-body">
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="form-success" role="status">
              {message}
            </p>
          ) : null}
          {filtered.length === 0 ? (
            <p>{accounts.length === 0 ? 'No accounts yet.' : 'No matches. Try another search or filter.'}</p>
          ) : (
            <div className="table-wrap table-wrap-actions">
              <table className="table">
                <thead>
                  <tr>
                    <th>
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('code')}>
                        Code
                        <SortIcon active={sortKey === 'code'} dir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('name')}>
                        Name
                        <SortIcon active={sortKey === 'name'} dir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('type')}>
                        Class
                        <SortIcon active={sortKey === 'type'} dir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('subtype')}>
                        Subtype
                        <SortIcon active={sortKey === 'subtype'} dir={sortDir} />
                      </button>
                    </th>
                    <th>
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('status')}>
                        Status
                        <SortIcon active={sortKey === 'status'} dir={sortDir} />
                      </button>
                    </th>
                    <th className="th-num">
                      <button type="button" className="th-sort-btn th-sort-btn-end" onClick={() => toggleSort('balance')}>
                        Balance
                        <SortIcon active={sortKey === 'balance'} dir={sortDir} />
                      </button>
                    </th>
                    <th className="th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{row.code}</td>
                      <td>
                        <Link href={`/accounts/${row.id}`}>{row.name}</Link>
                        {row.isGroup === '1' ? <span className="coa-tag">Group</span> : null}
                        {row.isSystem === '1' ? <span className="coa-tag">Built-in</span> : null}
                      </td>
                      <td>
                        <Badge tone={typeTone(row.type)}>{classLabel(row.type)}</Badge>
                      </td>
                      <td>{subtypeLabel(row.subtype)}</td>
                      <td>{statusLabel(row.isActive)}</td>
                      <td className={`td-num ${row.balance < 0 ? 'amount-negative' : 'amount-positive'}`}>
                        {money(row.balance, currency)}
                      </td>
                      <td className="td-actions">
                        <div className="party-row-actions party-row-actions-inline">
                          <Link href={`/accounts/${row.id}`} className="button ghost icon" aria-label={`View ${row.name}`}>
                            <Eye size={16} />
                          </Link>
                          <button
                            type="button"
                            className="button ghost doc-action-trigger"
                            aria-haspopup="menu"
                            aria-expanded={openMenuId === row.id}
                            ref={(node) => {
                              if (node) triggerRefs.current.set(row.id, node);
                              else triggerRefs.current.delete(row.id);
                            }}
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setMenuPos(menuPosition(rect, { menuWidth: 220, menuHeight: 160 }));
                              setOpenMenuId((cur) => (cur === row.id ? null : row.id));
                            }}
                          >
                            Actions
                            <ChevronDown size={14} aria-hidden />
                          </button>
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
              </span>
              <div className="party-pagination-actions">
                <Button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                  Previous
                </Button>
                <Button type="button" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                  Next
                </Button>
              </div>
            </div>
          ) : filtered.length > 0 ? (
            <div className="party-pagination">
              <span>
                {filtered.length} account{filtered.length === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}
        </div>
      </Card>
      {menuPortal}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.type === 'archive' ? `Archive ${confirm.row.code}?` : `Reactivate ${confirm?.row.code}?`}
        message={
          confirm?.type === 'archive'
            ? 'The account stays in history. Journals keep their original lines. Server rules still block a nonzero balance or protected control.'
            : 'The account returns to the active chart.'
        }
        confirmLabel={confirm?.type === 'archive' ? 'Archive' : 'Reactivate'}
        tone={confirm?.type === 'archive' ? 'warning' : 'primary'}
        busy={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const row = confirm.row;
          setConfirm(null);
          if (confirm.type === 'archive') archive(row);
          else reactivate(row);
        }}
      />
    </div>
  );
}
