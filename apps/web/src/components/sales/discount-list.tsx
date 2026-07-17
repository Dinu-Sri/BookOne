'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  archiveDiscountFromForm,
  setDiscountActiveFromForm,
  type DiscountRow,
} from '@/app/actions/discounts';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { pushStatusToast } from '@/components/layout/status-toast';
import { useRouter } from 'next/navigation';

export function DiscountList({ rows: initialRows }: { rows: DiscountRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<DiscountRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.code, r.discountType, r.notes].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [rows, query]);

  async function toggleActive(row: DiscountRow) {
    setBusy(true);
    const next = row.isActive === '1' ? '0' : '1';
    const fd = new FormData();
    fd.set('id', row.id);
    fd.set('active', next);
    try {
      await setDiscountActiveFromForm(fd);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: next } : r)));
      pushStatusToast({
        kind: 'success',
        message: next === '1' ? 'Discount activated' : 'Discount deactivated',
      });
      router.refresh();
    } catch (e) {
      pushStatusToast({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Could not update',
      });
    } finally {
      setBusy(false);
    }
  }

  async function doArchive() {
    if (!confirmArchive) return;
    setBusy(true);
    const fd = new FormData();
    fd.set('id', confirmArchive.id);
    try {
      await archiveDiscountFromForm(fd);
      setRows((prev) => prev.filter((r) => r.id !== confirmArchive.id));
      setConfirmArchive(null);
      pushStatusToast({ kind: 'success', message: 'Discount archived' });
      router.refresh();
    } catch (e) {
      pushStatusToast({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Archive failed',
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
            placeholder="Search discounts…"
            aria-label="Search discounts"
            autoComplete="off"
          />
        </div>
        <Link href="/sales/discounts/new">
          <Button variant="primary" type="button">
            New discount
          </Button>
        </Link>
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: 28 }}>
              <h3>{rows.length === 0 ? 'No discounts yet' : 'No matches'}</h3>
              <p style={{ marginTop: 6 }}>
                {rows.length === 0
                  ? 'Create percent or fixed discounts for quotes, orders, invoices, and POS.'
                  : 'Try another search.'}
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Value</th>
                    <th>Active</th>
                    <th>Dates</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                        {r.notes ? (
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{r.notes}</div>
                        ) : null}
                      </td>
                      <td>{r.code ?? '—'}</td>
                      <td>{r.discountType === 'percent' ? 'Percent' : 'Fixed'}</td>
                      <td>
                        {r.discountType === 'percent' ? `${r.value}%` : formatLKR(r.value)}
                      </td>
                      <td>
                        <StatusBadge status={r.isActive === '1' ? 'active' : 'inactive'} />
                      </td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {[r.startsOn, r.endsOn].filter(Boolean).join(' → ') || '—'}
                      </td>
                      <td>
                        <div className="party-row-actions">
                          <Link href={`/sales/discounts/${r.id}/edit`}>
                            <Button variant="secondary" type="button">
                              Edit
                            </Button>
                          </Link>
                          <Button
                            variant="secondary"
                            type="button"
                            disabled={busy}
                            onClick={() => toggleActive(r)}
                          >
                            {r.isActive === '1' ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            variant="ghost"
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmArchive(r)}
                          >
                            Archive
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={Boolean(confirmArchive)}
        title="Archive discount?"
        message={
          confirmArchive
            ? `"${confirmArchive.name}" will be removed from lists. Existing documents keep their applied amounts.`
            : ''
        }
        confirmLabel="Archive"
        tone="danger"
        busy={busy}
        onCancel={() => setConfirmArchive(null)}
        onConfirm={doArchive}
      />
    </div>
  );
}
