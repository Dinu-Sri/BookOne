'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  dispatchRentalLine,
  returnRentalLine,
  type RentalJobLine,
} from '@/app/actions/rental-bookings';
import { pushStatusToast } from '@/components/layout/status-toast';
import { StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

function outstanding(row: RentalJobLine) {
  if (row.status === 'reserved' || row.status === 'hold') return row.qty - row.dispatchedQty;
  return row.dispatchedQty - row.returnedQty - row.damagedQty - row.missingQty;
}

export function RentalOpsPanel({
  rows,
  title = 'Hire dispatch / return',
  compact = false,
}: {
  rows: RentalJobLine[];
  title?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [goodQty, setGoodQty] = useState('0');
  const [damagedQty, setDamagedQty] = useState('0');
  const [missingQty, setMissingQty] = useState('0');

  function openReturn(row: RentalJobLine) {
    const left = Math.max(0, outstanding(row));
    setOpenId(row.id);
    setGoodQty(String(left));
    setDamagedQty('0');
    setMissingQty('0');
  }

  function runDispatch(id: string) {
    startTransition(async () => {
      const res = await dispatchRentalLine(id);
      if (!res.ok) {
        pushStatusToast({ kind: 'error', message: res.error ?? 'Dispatch failed' });
        return;
      }
      pushStatusToast({ kind: 'success', message: 'Dispatched to On rent' });
      router.refresh();
    });
  }

  function runReturn(id: string) {
    startTransition(async () => {
      const res = await returnRentalLine({
        bookingLineId: id,
        goodQty: Number(goodQty) || 0,
        damagedQty: Number(damagedQty) || 0,
        missingQty: Number(missingQty) || 0,
      });
      if (!res.ok) {
        pushStatusToast({ kind: 'error', message: res.error ?? 'Return failed' });
        return;
      }
      pushStatusToast({ kind: 'success', message: 'Return recorded' });
      setOpenId(null);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return compact ? null : (
      <Card>
        <div className="card-body">
          <h2 className="card-title">{title}</h2>
          <p style={{ color: 'var(--ink-muted)', margin: 0 }}>No reserved or on-rent hire lines.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="card-body" style={{ padding: 0 }}>
        <div style={{ padding: '14px 16px 0' }}>
          <h2 className="card-title" style={{ margin: 0 }}>
            {title}
          </h2>
          <p style={{ color: 'var(--ink-muted)', fontSize: 13, margin: '6px 0 12px' }}>
            Dispatch moves fleet to On rent. Return splits good / damaged / missing.
          </p>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Item</th>
                <th>Period</th>
                <th>Qty</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{row.documentNumber}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                      {row.partyName}
                      {row.venue ? ` · ${row.venue}` : ''}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 650 }}>{row.productName}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{row.sku}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                    {row.hireFrom} → {row.hireTo}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {row.qty}
                    {row.dispatchedQty > 0 ? (
                      <div style={{ color: 'var(--ink-soft)', fontSize: 12 }}>
                        out {row.dispatchedQty}
                        {row.returnedQty || row.damagedQty || row.missingQty
                          ? ` · back ${row.returnedQty} / dmg ${row.damagedQty} / miss ${row.missingQty}`
                          : ''}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <StatusBadge status={row.overdue ? 'overdue' : row.status} />
                  </td>
                  <td>
                    {row.status === 'reserved' ? (
                      <Button
                        variant="primary"
                        type="button"
                        disabled={pending}
                        onClick={() => runDispatch(row.id)}
                      >
                        Dispatch
                      </Button>
                    ) : row.status === 'dispatched' ? (
                      openId === row.id ? (
                        <div style={{ display: 'grid', gap: 6, minWidth: 180 }}>
                          <label style={{ fontSize: 11 }}>
                            Good
                            <input
                              className="input"
                              inputMode="decimal"
                              value={goodQty}
                              onChange={(e) => setGoodQty(e.target.value)}
                            />
                          </label>
                          <label style={{ fontSize: 11 }}>
                            Damaged
                            <input
                              className="input"
                              inputMode="decimal"
                              value={damagedQty}
                              onChange={(e) => setDamagedQty(e.target.value)}
                            />
                          </label>
                          <label style={{ fontSize: 11 }}>
                            Missing
                            <input
                              className="input"
                              inputMode="decimal"
                              value={missingQty}
                              onChange={(e) => setMissingQty(e.target.value)}
                            />
                          </label>
                          <div className="cluster" style={{ gap: 6 }}>
                            <Button
                              variant="primary"
                              type="button"
                              disabled={pending}
                              onClick={() => runReturn(row.id)}
                            >
                              Record return
                            </Button>
                            <Button variant="ghost" type="button" onClick={() => setOpenId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="secondary" type="button" onClick={() => openReturn(row)}>
                          Return
                        </Button>
                      )
                    ) : null}
                    {compact ? null : (
                      <div style={{ marginTop: 6 }}>
                        <Link
                          href={
                            row.documentType === 'quotation'
                              ? `/sales/quotations/${row.documentId}/edit`
                              : row.documentType === 'sales_order'
                                ? '/sales/orders'
                                : `/sales/invoices/${row.documentId}`
                          }
                        >
                          <Button variant="ghost" type="button">
                            Open doc
                          </Button>
                        </Link>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
