import Link from 'next/link';
import {
  archivePartyFromForm,
  deletePartyFromForm,
  restorePartyFromForm,
  type PartyListFilter,
  type PartyRow,
} from '@/app/actions/parties';
import { PeriodSelector } from '@/components/layout/period-selector';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

function sortHref(
  basePath: string,
  filter: PartyListFilter,
  column: string,
  currentSort: string,
  currentDir: string,
) {
  const params = new URLSearchParams();
  if (filter.q) params.set('q', filter.q);
  if (filter.status && filter.status !== 'active') params.set('status', filter.status);
  if (filter.period) params.set('period', filter.period);
  const nextDir = currentSort === column && currentDir === 'asc' ? 'desc' : 'asc';
  params.set('sort', column);
  params.set('dir', nextDir);
  const s = params.toString();
  return s ? `${basePath}?${s}` : basePath;
}

function SortTh({
  label,
  column,
  basePath,
  filter,
  sort,
  dir,
}: {
  label: string;
  column: string;
  basePath: string;
  filter: PartyListFilter;
  sort: string;
  dir: string;
}) {
  const active = sort === column;
  const arrow = active ? (dir === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <th>
      <Link
        href={sortHref(basePath, filter, column, sort, dir)}
        style={{ color: 'inherit', textDecoration: 'none', whiteSpace: 'nowrap' }}
      >
        {label}
        {arrow}
      </Link>
    </th>
  );
}

export function PartyListScreen({
  role,
  rows,
  filter,
  period,
}: {
  role: 'customer' | 'vendor';
  rows: PartyRow[];
  filter: PartyListFilter;
  period?: { selected: string | null; available: string[] };
}) {
  const basePath = role === 'customer' ? '/parties/customers' : '/parties/vendors';
  const title = role === 'customer' ? 'Customers' : 'Vendors';
  const newHref = `${basePath}/new`;
  const newLabel = role === 'customer' ? 'New customer' : 'New vendor';
  const balanceLabel = role === 'customer' ? 'Balance' : 'Balance';

  const q = filter.q ?? '';
  const sort = filter.sort ?? 'name';
  const dir = filter.dir ?? 'asc';

  return (
    <div className="workspace party-workspace">
      {/* Single compact toolbar: search | period | new */}
      <div className="party-toolbar">
        <form method="get" action={basePath} className="party-search-form">
          <input
            className="input party-search"
            name="q"
            defaultValue={q}
            placeholder={`Search ${title.toLowerCase()}…`}
            aria-label="Search"
          />
          {sort !== 'name' ? <input type="hidden" name="sort" value={sort} /> : null}
          {dir !== 'asc' ? <input type="hidden" name="dir" value={dir} /> : null}
          {filter.period && filter.period !== 'all' ? (
            <input type="hidden" name="period" value={filter.period} />
          ) : null}
        </form>
        <div className="party-toolbar-period">
          {period ? (
            <PeriodSelector selected={period.selected} available={period.available} compact />
          ) : null}
        </div>
        <Link href={newHref}>
          <Button variant="primary" type="button">{newLabel}</Button>
        </Link>
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="empty-state" style={{ padding: 28 }}>
              <h3>No {title.toLowerCase()} yet</h3>
              <p>Use {newLabel} to add the first record.</p>
              <div style={{ marginTop: 12 }}>
                <Link href={newHref}>
                  <Button variant="primary" type="button">{newLabel}</Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <SortTh label="Code" column="code" basePath={basePath} filter={filter} sort={sort} dir={dir} />
                    <SortTh label="Name" column="name" basePath={basePath} filter={filter} sort={sort} dir={dir} />
                    <th>Phone</th>
                    <SortTh
                      label={balanceLabel}
                      column="balance"
                      basePath={basePath}
                      filter={filter}
                      sort={sort}
                      dir={dir}
                    />
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
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
                              <form action={archivePartyFromForm}>
                                <input type="hidden" name="id" value={p.id} />
                                <Button variant="ghost" type="submit">
                                  Archive
                                </Button>
                              </form>
                            ) : (
                              <form action={restorePartyFromForm}>
                                <input type="hidden" name="id" value={p.id} />
                                <Button variant="ghost" type="submit">
                                  Restore
                                </Button>
                              </form>
                            )}
                            {p.documentCount === 0 ? (
                              <form action={deletePartyFromForm}>
                                <input type="hidden" name="id" value={p.id} />
                                <Button variant="ghost" type="submit">
                                  Delete
                                </Button>
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
