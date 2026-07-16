import Link from 'next/link';
import {
  archivePartyFromForm,
  deletePartyFromForm,
  restorePartyFromForm,
  type PartyListFilter,
  type PartyRow,
} from '@/app/actions/parties';
import { formatLKR, ModulePageHeader, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

function buildQuery(base: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(base).forEach(([k, v]) => {
    if (v && v !== 'all' && !(k === 'sort' && v === 'name') && !(k === 'dir' && v === 'asc') && !(k === 'status' && v === 'active')) {
      params.set(k, v);
    }
  });
  // Always keep status if not default active intentionally when all
  if (base.status && base.status !== 'active') params.set('status', base.status);
  if (base.q) params.set('q', base.q);
  if (base.sort && base.sort !== 'name') params.set('sort', base.sort);
  if (base.dir && base.dir !== 'asc') params.set('dir', base.dir);
  if (base.dualOnly && base.dualOnly !== 'all') params.set('dualOnly', base.dualOnly);
  if (base.taxStatus && base.taxStatus !== 'all') params.set('taxStatus', base.taxStatus);
  if (base.hasBalance && base.hasBalance !== 'all') params.set('hasBalance', base.hasBalance);
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function PartyListScreen({
  role,
  rows,
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
  const balanceLabel = role === 'customer' ? 'Open AR' : 'Open AP';

  const q = filter.q ?? '';
  const status = filter.status ?? 'active';
  const sort = filter.sort ?? 'name';
  const dir = filter.dir ?? 'asc';
  const dualOnly = filter.dualOnly ?? 'all';
  const taxStatus = filter.taxStatus ?? 'all';
  const hasBalance = filter.hasBalance ?? 'all';

  return (
    <div className="workspace">
      <ModulePageHeader
        eyebrow="Parties"
        title={title}
        lead={
          role === 'customer'
            ? 'Customer master for sales, receivables, and tax invoices. Dual-role partners also appear under Vendors.'
            : 'Vendor master for purchases, payables, and bank payments. Dual-role partners also appear under Customers.'
        }
        newHref={newHref}
        newLabel={newLabel}
      />

      <Card style={{ marginBottom: 16 }}>
        <div className="card-body">
          <form method="get" className="form-grid" action={basePath}>
            <div className="field">
              <label>Search</label>
              <input className="input" name="q" defaultValue={q} placeholder="Name, code, phone, TIN, city…" />
            </div>
            <div className="field">
              <label>Status</label>
              <select className="input" name="status" defaultValue={status}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="blocked">Blocked</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="field">
              <label>Roles</label>
              <select className="input" name="dualOnly" defaultValue={dualOnly}>
                <option value="all">All</option>
                <option value="dual">Dual role only</option>
                <option value="single">Single role only</option>
              </select>
            </div>
            <div className="field">
              <label>Tax status</label>
              <select className="input" name="taxStatus" defaultValue={taxStatus}>
                <option value="all">All</option>
                <option value="registered">Registered</option>
                <option value="unregistered">Unregistered</option>
                <option value="exempt">Exempt</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div className="field">
              <label>Balance</label>
              <select className="input" name="hasBalance" defaultValue={hasBalance}>
                <option value="all">Any</option>
                <option value="yes">Has open balance</option>
                <option value="no">Zero balance</option>
              </select>
            </div>
            <div className="field">
              <label>Sort</label>
              <select className="input" name="sort" defaultValue={sort}>
                <option value="name">Name</option>
                <option value="code">Code</option>
                <option value="balance">Open balance</option>
                <option value="created">Created</option>
                <option value="updated">Updated</option>
              </select>
            </div>
            <div className="field">
              <label>Direction</label>
              <select className="input" name="dir" defaultValue={dir}>
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
            <div className="field" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <Button variant="primary" type="submit">Apply</Button>
              <Link href={basePath}>
                <Button variant="secondary" type="button">Clear</Button>
              </Link>
            </div>
          </form>
        </div>
      </Card>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              <h3>No {title.toLowerCase()} found</h3>
              <p>Adjust filters or create a new record.</p>
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
                    <th>Code</th>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>City</th>
                    <th>Tax</th>
                    {role === 'customer' ? <th>Credit limit</th> : <th>Terms</th>}
                    <th>{balanceLabel}</th>
                    <th>Status</th>
                    <th>Roles</th>
                    <th>Actions</th>
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
                          <strong>{p.displayName || p.name}</strong>
                          {p.legalName && p.legalName !== p.name && p.legalName !== p.displayName ? (
                            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{p.legalName}</div>
                          ) : null}
                        </td>
                        <td>
                          <div>{p.phoneMobile || p.phone || '—'}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{p.email || ''}</div>
                        </td>
                        <td>{p.city ?? '—'}</td>
                        <td>
                          <div><StatusBadge status={p.taxStatus} /></div>
                          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{p.tin || p.taxId || ''}</div>
                        </td>
                        {role === 'customer' ? (
                          <td>{p.creditLimit != null ? formatLKR(p.creditLimit) : '—'}</td>
                        ) : (
                          <td>{p.paymentTermsDays != null ? `${p.paymentTermsDays}d` : '—'}</td>
                        )}
                        <td style={balance > 0 ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                          {formatLKR(balance)}
                        </td>
                        <td><StatusBadge status={p.status} /></td>
                        <td>
                          {p.isCustomer && p.isVendor ? (
                            <StatusBadge status="both" />
                          ) : p.isCustomer ? (
                            <StatusBadge status="customer" />
                          ) : (
                            <StatusBadge status="vendor" />
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <Link href={editHref}>
                              <Button variant="secondary" type="button">Edit</Button>
                            </Link>
                            {p.status === 'active' ? (
                              <form action={archivePartyFromForm}>
                                <input type="hidden" name="id" value={p.id} />
                                <Button variant="ghost" type="submit">Archive</Button>
                              </form>
                            ) : (
                              <form action={restorePartyFromForm}>
                                <input type="hidden" name="id" value={p.id} />
                                <Button variant="ghost" type="submit">Restore</Button>
                              </form>
                            )}
                            {p.documentCount === 0 ? (
                              <form action={deletePartyFromForm}>
                                <input type="hidden" name="id" value={p.id} />
                                <Button variant="ghost" type="submit">Delete</Button>
                              </form>
                            ) : (
                              <span title={p.deleteReasons.join(' ') || 'Linked documents'} style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                                No delete
                              </span>
                            )}
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
      <p style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-soft)' }}>
        Showing {rows.length} record(s). Delete is only available when the party has no commercial documents or simple-entry history.
        {buildQuery({}) ? null : null}
      </p>
    </div>
  );
}
