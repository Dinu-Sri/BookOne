'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  dispatchRentalLine,
  returnRentalLine,
  type RentalJobLine,
} from '@/app/actions/rental-bookings';
import {
  collectRentalDeposit,
  invoiceHireCharges,
  refundRentalDeposit,
} from '@/app/actions/rental-money';
import { pushStatusToast } from '@/components/layout/status-toast';
import { StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

function outstanding(row: RentalJobLine) {
  if (row.status === 'reserved' || row.status === 'hold') return row.qty - row.dispatchedQty;
  return row.dispatchedQty - row.returnedQty - row.damagedQty - row.missingQty;
}

function money(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
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
  const [damageCharge, setDamageCharge] = useState('0');
  const [lateFee, setLateFee] = useState('0');
  const [applyDeposit, setApplyDeposit] = useState(true);
  const [depositAmt, setDepositAmt] = useState('');
  const [refundAmt, setRefundAmt] = useState('');

  const jobs = useMemo(() => {
    const map = new Map<string, RentalJobLine>();
    for (const row of rows) {
      if (!map.has(row.documentId)) map.set(row.documentId, row);
    }
    return [...map.values()];
  }, [rows]);

  function openReturn(row: RentalJobLine) {
    const left = Math.max(0, outstanding(row));
    const suggestedDamage = money(row.replacementPrice * 0);
    setOpenId(row.id);
    setGoodQty(String(left));
    setDamagedQty('0');
    setMissingQty('0');
    setDamageCharge(String(suggestedDamage));
    setLateFee(String(money(row.daysOverdue * row.defaultLateFeePerDay)));
    setApplyDeposit(row.depositOpen > 0);
  }

  function updateDamageCharge(nextDamaged: string, nextMissing: string, row: RentalJobLine) {
    const dmg = Number(nextDamaged) || 0;
    const miss = Number(nextMissing) || 0;
    setDamageCharge(String(money((dmg + miss) * row.replacementPrice)));
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

  function runReturn(row: RentalJobLine) {
    startTransition(async () => {
      const res = await returnRentalLine({
        bookingLineId: row.id,
        goodQty: Number(goodQty) || 0,
        damagedQty: Number(damagedQty) || 0,
        missingQty: Number(missingQty) || 0,
      });
      if (!res.ok) {
        pushStatusToast({ kind: 'error', message: res.error ?? 'Return failed' });
        return;
      }
      const charge = money(Number(damageCharge) || 0);
      const fee = money(Number(lateFee) || 0);
      if (charge + fee > 0) {
        const inv = await invoiceHireCharges({
          documentId: row.documentId,
          damageCharge: charge,
          lateFee: fee,
          applyDeposit,
        });
        if (!inv.ok) {
          pushStatusToast({
            kind: 'error',
            message: `Returned, but charges invoice failed: ${inv.error ?? 'unknown'}`,
          });
        } else {
          pushStatusToast({ kind: 'success', message: 'Return recorded and hire charges invoiced' });
        }
      } else {
        pushStatusToast({ kind: 'success', message: 'Return recorded' });
      }
      setOpenId(null);
      router.refresh();
    });
  }

  function runCollect(documentId: string) {
    const amount = money(Number(depositAmt) || 0);
    if (amount <= 0) {
      pushStatusToast({ kind: 'error', message: 'Enter a deposit amount.' });
      return;
    }
    startTransition(async () => {
      const res = await collectRentalDeposit({ documentId, amount });
      if (!res.ok) {
        pushStatusToast({ kind: 'error', message: res.error ?? 'Deposit failed' });
        return;
      }
      pushStatusToast({ kind: 'success', message: 'Deposit collected to 2400' });
      setDepositAmt('');
      router.refresh();
    });
  }

  function runRefund(documentId: string, open: number) {
    const amount = money(Number(refundAmt) || open);
    startTransition(async () => {
      const res = await refundRentalDeposit({ documentId, amount });
      if (!res.ok) {
        pushStatusToast({ kind: 'error', message: res.error ?? 'Refund failed' });
        return;
      }
      pushStatusToast({ kind: 'success', message: 'Deposit refunded' });
      setRefundAmt('');
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
            Dispatch moves fleet to On rent. Return splits good / damaged / missing. Deposits sit on 2400 until
            refunded or applied to damage/late charges.
          </p>
        </div>

        {jobs.map((job) => (
          <div
            key={job.documentId}
            style={{
              margin: '0 16px 12px',
              padding: 12,
              border: '1px solid var(--line)',
              borderRadius: 10,
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong>{job.documentNumber}</strong>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{job.partyName}</div>
              </div>
              <div style={{ fontSize: 13 }}>
                Deposit open <strong>LKR {job.depositOpen.toFixed(2)}</strong>
                <span style={{ color: 'var(--ink-soft)' }}>
                  {' '}
                  · held {job.depositHeld.toFixed(2)} · applied {job.depositApplied.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="cluster" style={{ gap: 8, flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ width: 120 }}
                inputMode="decimal"
                placeholder="Amount"
                value={depositAmt}
                onChange={(e) => setDepositAmt(e.target.value)}
                aria-label="Deposit amount"
              />
              <Button
                variant="secondary"
                type="button"
                disabled={pending}
                onClick={() => runCollect(job.documentId)}
              >
                Collect deposit
              </Button>
              {job.depositOpen > 0 ? (
                <>
                  <input
                    className="input"
                    style={{ width: 120 }}
                    inputMode="decimal"
                    placeholder={String(job.depositOpen)}
                    value={refundAmt}
                    onChange={(e) => setRefundAmt(e.target.value)}
                    aria-label="Refund amount"
                  />
                  <Button
                    variant="ghost"
                    type="button"
                    disabled={pending}
                    onClick={() => runRefund(job.documentId, job.depositOpen)}
                  >
                    Refund deposit
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ))}

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
                        <div style={{ display: 'grid', gap: 6, minWidth: 200 }}>
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
                              onChange={(e) => {
                                setDamagedQty(e.target.value);
                                updateDamageCharge(e.target.value, missingQty, row);
                              }}
                            />
                          </label>
                          <label style={{ fontSize: 11 }}>
                            Missing
                            <input
                              className="input"
                              inputMode="decimal"
                              value={missingQty}
                              onChange={(e) => {
                                setMissingQty(e.target.value);
                                updateDamageCharge(damagedQty, e.target.value, row);
                              }}
                            />
                          </label>
                          <label style={{ fontSize: 11 }}>
                            Damage / missing charge
                            <input
                              className="input"
                              inputMode="decimal"
                              value={damageCharge}
                              onChange={(e) => setDamageCharge(e.target.value)}
                            />
                          </label>
                          <label style={{ fontSize: 11 }}>
                            Late fee{row.daysOverdue ? ` (${row.daysOverdue}d)` : ''}
                            <input
                              className="input"
                              inputMode="decimal"
                              value={lateFee}
                              onChange={(e) => setLateFee(e.target.value)}
                            />
                          </label>
                          {row.depositOpen > 0 ? (
                            <label className="party-check" style={{ fontSize: 12 }}>
                              <input
                                type="checkbox"
                                checked={applyDeposit}
                                onChange={(e) => setApplyDeposit(e.target.checked)}
                              />
                              Apply deposit (open {row.depositOpen.toFixed(2)})
                            </label>
                          ) : null}
                          <div className="cluster" style={{ gap: 6 }}>
                            <Button
                              variant="primary"
                              type="button"
                              disabled={pending}
                              onClick={() => runReturn(row)}
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
