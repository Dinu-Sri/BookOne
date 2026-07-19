'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { payVendorBills } from '@/app/actions/documents';
import type { OpenApBill } from '@/app/actions/commercial-docs';
import { formatLKR, todayString } from '@/components/module/list-page';
import { pushStatusToast } from '@/components/layout/status-toast';
import { Button, Card } from '@/components/ui/bookone-ui';

export function PayVendorsForm({
  bills,
  paymentAccounts,
  preselectId,
}: {
  bills: OpenApBill[];
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
    for (const b of bills) {
      if (preselectId && b.id === preselectId) {
        init[b.id] = String(b.balanceDue);
      } else if (!preselectId) {
        init[b.id] = '';
      }
    }
    return init;
  });
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const b of bills) {
      init[b.id] = preselectId ? b.id === preselectId : false;
    }
    return init;
  });

  const totalPay = useMemo(() => {
    let t = 0;
    for (const b of bills) {
      if (!selected[b.id]) continue;
      const n = Number(String(amounts[b.id] ?? '').replace(/[^0-9.-]/g, '')) || 0;
      t += n;
    }
    return Math.round(t * 100) / 100;
  }, [bills, selected, amounts]);

  function toggle(id: string, balance: number) {
    setSelected((prev) => {
      const next = !prev[id];
      if (next && !amounts[id]) {
        setAmounts((a) => ({ ...a, [id]: String(balance) }));
      }
      return { ...prev, [id]: next };
    });
  }

  function submit() {
    const allocations = bills
      .filter((b) => selected[b.id])
      .map((b) => ({
        documentId: b.id,
        amount: Number(String(amounts[b.id] ?? '').replace(/[^0-9.-]/g, '')) || 0,
      }))
      .filter((a) => a.amount > 0);

    if (allocations.length === 0) {
      pushStatusToast({ kind: 'error', message: 'Select at least one bill and enter an amount.' });
      return;
    }

    startTransition(async () => {
      const res = await payVendorBills({
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
        message: `Paid ${res.paidCount} bill${res.paidCount === 1 ? '' : 's'} · LKR ${totalPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      });
      const params = new URLSearchParams({
        date: paymentDate,
        account: accountCode,
        total: String(totalPay),
      });
      for (const a of allocations) {
        params.append('doc', a.documentId);
        params.append('amt', String(a.amount));
      }
      router.push(`/purchase/payments/remittance?${params.toString()}`);
      router.refresh();
    });
  }

  return (
    <div className="workspace party-workspace">
      <div className="party-form-top">
        <Link href="/purchase/payments" className="party-back-btn">
          <span className="party-back-arrow" aria-hidden>
            ←
          </span>
          <span>
            <strong>Back</strong>
            <small>Pay vendors</small>
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
              <label>Pay from account *</label>
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

          {bills.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>
              <h3>No open bills</h3>
              <p>All purchase bills are paid, or none have been posted yet.</p>
              <div style={{ marginTop: 12 }}>
                <Link href="/purchase/purchases/new">
                  <Button variant="primary" type="button">
                    New purchase
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
                    <th>Bill</th>
                    <th>Vendor</th>
                    <th>Date</th>
                    <th>Due</th>
                    <th>Balance</th>
                    <th>Pay amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(selected[b.id])}
                          onChange={() => toggle(b.id, b.balanceDue)}
                          aria-label={`Select ${b.documentNumber}`}
                        />
                      </td>
                      <td>
                        <Link href={`/purchase/purchases/${b.id}`}>
                          <strong>{b.documentNumber}</strong>
                        </Link>
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{b.documentType}</div>
                      </td>
                      <td>{b.partyName}</td>
                      <td>{b.issueDate}</td>
                      <td>{b.dueDate || '—'}</td>
                      <td>{formatLKR(b.balanceDue)}</td>
                      <td>
                        <input
                          className="input"
                          inputMode="decimal"
                          disabled={!selected[b.id]}
                          value={amounts[b.id] ?? ''}
                          onChange={(e) => setAmounts((prev) => ({ ...prev, [b.id]: e.target.value }))}
                          placeholder={String(b.balanceDue)}
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
            <strong>Total payment: {formatLKR(totalPay)}</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/purchase/payments">
                <Button variant="secondary" type="button">
                  Cancel
                </Button>
              </Link>
              <Button
                variant="primary"
                type="button"
                disabled={pending || totalPay <= 0}
                onClick={submit}
              >
                {pending ? 'Posting…' : 'Record payment'}
              </Button>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-soft)' }}>
            Posts Dr Accounts Payable 2100 · Cr bank/cash for each selected bill (up to balance due).
          </p>
        </div>
      </Card>
    </div>
  );
}
