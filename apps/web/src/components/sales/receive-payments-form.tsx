'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { receiveCustomerPayments } from '@/app/actions/documents';
import type { OpenArInvoice } from '@/app/actions/commercial-docs';
import { formatLKR, todayString } from '@/components/module/list-page';
import { pushStatusToast } from '@/components/layout/status-toast';
import { Button, Card } from '@/components/ui/bookone-ui';

export function ReceivePaymentsForm({
  invoices,
  paymentAccounts,
  preselectId,
}: {
  invoices: OpenArInvoice[];
  paymentAccounts: { code: string; name: string }[];
  preselectId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [paymentDate, setPaymentDate] = useState(todayString());
  const [accountCode, setAccountCode] = useState(
    paymentAccounts.find((a) => a.code === '1100')?.code ?? paymentAccounts[0]?.code ?? '1100',
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const inv of invoices) {
      if (preselectId && inv.id === preselectId) init[inv.id] = String(inv.balanceDue);
      else if (!preselectId) init[inv.id] = '';
    }
    return init;
  });
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const inv of invoices) {
      init[inv.id] = preselectId ? inv.id === preselectId : false;
    }
    return init;
  });

  const totalReceive = useMemo(() => {
    let t = 0;
    for (const inv of invoices) {
      if (!selected[inv.id]) continue;
      t += Number(String(amounts[inv.id] ?? '').replace(/[^0-9.-]/g, '')) || 0;
    }
    return Math.round(t * 100) / 100;
  }, [invoices, selected, amounts]);

  function toggle(id: string, balance: number) {
    setSelected((prev) => {
      const next = !prev[id];
      if (next && !amounts[id]) setAmounts((a) => ({ ...a, [id]: String(balance) }));
      return { ...prev, [id]: next };
    });
  }

  function submit() {
    const allocations = invoices
      .filter((inv) => selected[inv.id])
      .map((inv) => ({
        documentId: inv.id,
        amount: Number(String(amounts[inv.id] ?? '').replace(/[^0-9.-]/g, '')) || 0,
      }))
      .filter((a) => a.amount > 0);

    if (allocations.length === 0) {
      pushStatusToast({ kind: 'error', message: 'Select at least one invoice and enter an amount.' });
      return;
    }

    startTransition(async () => {
      const res = await receiveCustomerPayments({
        paymentDate,
        paymentAccountCode: accountCode,
        allocations,
      });
      if (!res.ok) {
        pushStatusToast({ kind: 'error', message: res.error ?? 'Payment failed' });
        return;
      }
      pushStatusToast({
        kind: 'success',
        message: `Received ${res.paidCount} payment${res.paidCount === 1 ? '' : 's'} · LKR ${totalReceive.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      });
      const params = new URLSearchParams({
        date: paymentDate,
        account: accountCode,
        total: String(totalReceive),
      });
      for (const a of allocations) {
        params.append('doc', a.documentId);
        params.append('amt', String(a.amount));
      }
      router.push(`/sales/payments/receipt?${params.toString()}`);
      router.refresh();
    });
  }

  return (
    <div className="workspace party-workspace">
      <div className="party-form-top">
        <Link href="/sales/payments" className="party-back-btn">
          <span className="party-back-arrow" aria-hidden>
            ←
          </span>
          <span>
            <strong>Back</strong>
            <small>Receive payments</small>
          </span>
        </Link>
      </div>

      <Card>
        <div className="card-body" style={{ display: 'grid', gap: 16 }}>
          <div className="doc-form-header" style={{ margin: 0 }}>
            <div className="field">
              <label>Payment date *</label>
              <input
                className="input"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </div>
            <div className="field field-span-2">
              <label>Deposit to account *</label>
              <select
                className="input"
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
              >
                {paymentAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {invoices.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>
              <h3>No open invoices</h3>
              <p>All invoices are paid, or none have been posted yet.</p>
              <div style={{ marginTop: 12 }}>
                <Link href="/sales/invoices/new">
                  <Button variant="primary" type="button">
                    New invoice
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }} />
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Due</th>
                    <th>Balance</th>
                    <th>Amount received</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(selected[inv.id])}
                          onChange={() => toggle(inv.id, inv.balanceDue)}
                          aria-label={`Select ${inv.documentNumber}`}
                        />
                      </td>
                      <td>
                        <Link href={`/sales/invoices/${inv.id}`}>
                          <strong>{inv.documentNumber}</strong>
                        </Link>
                      </td>
                      <td>{inv.partyName}</td>
                      <td>{inv.issueDate}</td>
                      <td>{inv.dueDate || '—'}</td>
                      <td>{formatLKR(inv.balanceDue)}</td>
                      <td>
                        <input
                          className="input"
                          inputMode="decimal"
                          disabled={!selected[inv.id]}
                          value={amounts[inv.id] ?? ''}
                          onChange={(e) =>
                            setAmounts((prev) => ({ ...prev, [inv.id]: e.target.value }))
                          }
                          placeholder={String(inv.balanceDue)}
                          style={{ maxWidth: 120 }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <strong>Total received: {formatLKR(totalReceive)}</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/sales/payments">
                <Button variant="secondary" type="button">
                  Cancel
                </Button>
              </Link>
              <Button
                variant="primary"
                type="button"
                disabled={pending || totalReceive <= 0}
                onClick={submit}
              >
                {pending ? 'Posting…' : 'Record payment'}
              </Button>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-soft)' }}>
            Posts Dr bank/cash · Cr Accounts Receivable 1300 for each selected invoice (up to balance
            due). Same pattern as QuickBooks “Receive payment”.
          </p>
        </div>
      </Card>
    </div>
  );
}
