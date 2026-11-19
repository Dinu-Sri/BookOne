'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui/bookone-ui';
import { withFormPending } from '@/components/ui/form-busy';
import { applyPartyAdvance, issuePartyAdvance } from '@/app/actions/advances';
import type { AdvanceKind } from '@bookone/accounting';

type AdvanceRow = {
  id: string;
  kind: AdvanceKind;
  partyId: string;
  partyName: string;
  issuedOn: string;
  issued: number;
  remaining: number;
  status: string;
  version: number;
};

type PartyOption = { id: string; name: string; kind: string; isCustomer?: string; isVendor?: string };
type DocumentOption = {
  id: string;
  partyId: string;
  documentNumber: string;
  documentType: string;
  balanceDue: number;
};

export function AdvancesPanel({
  advances,
  parties,
  documents,
  canWrite,
}: {
  advances: AdvanceRow[];
  parties: PartyOption[];
  documents: DocumentOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<AdvanceKind>('customer');
  const [partyId, setPartyId] = useState(parties[0]?.id ?? '');
  const [amount, setAmount] = useState('1000');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashCode, setCashCode] = useState('1000');
  const [applyId, setApplyId] = useState(advances[0]?.id ?? '');
  const [applyAmount, setApplyAmount] = useState('400');
  const [applyKind, setApplyKind] = useState<'apply' | 'refund' | 'expense_settle' | 'return_cash'>('apply');
  const [documentId, setDocumentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const filteredParties = useMemo(
    () =>
      parties.filter((party) => {
        if (kind === 'customer') return party.kind === 'customer' || party.isCustomer === '1';
        if (kind === 'supplier') return party.kind === 'vendor' || party.isVendor === '1';
        return party.kind === 'staff';
      }),
    [kind, parties],
  );

  const selectedAdvance = advances.find((row) => row.id === applyId);

  useEffect(() => {
    if (selectedAdvance?.kind === 'staff' && (applyKind === 'apply' || applyKind === 'refund')) {
      setApplyKind('expense_settle');
    }
    if (selectedAdvance && selectedAdvance.kind !== 'staff' && (applyKind === 'expense_settle' || applyKind === 'return_cash')) {
      setApplyKind('apply');
    }
  }, [selectedAdvance?.kind, applyKind, selectedAdvance]);

  const eligibleDocuments = useMemo(() => {
    if (!selectedAdvance) return [];
    return documents.filter((doc) => {
      if (doc.partyId !== selectedAdvance.partyId) return false;
      if (selectedAdvance.kind === 'customer') {
        return doc.documentType === 'sales_invoice' || doc.documentType === 'pos_sale' || doc.documentType === 'customer_invoice';
      }
      if (selectedAdvance.kind === 'supplier') {
        return (
          doc.documentType === 'purchase' ||
          doc.documentType === 'import_purchase' ||
          doc.documentType === 'vendor_bill' ||
          doc.documentType === 'cash_purchase'
        );
      }
      return false;
    });
  }, [documents, selectedAdvance]);

  function issue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(() => {
      void withFormPending(async () => {
        const result = await issuePartyAdvance({
          kind,
          partyId,
          amount: Number(amount),
          date,
          cashCode,
          taxable: false,
          idempotencyKey: `adv-${kind}-${partyId}-${date}-${amount}`,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(`Advance recorded. Remaining ${result.data.remaining.toFixed(2)}.`);
        router.refresh();
      });
    });
  }

  function apply(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(() => {
      void withFormPending(async () => {
        const current = advances.find((row) => row.id === applyId);
        const result = await applyPartyAdvance({
          advanceId: applyId,
          amount: Number(applyAmount),
          kind: applyKind,
          documentId: applyKind === 'apply' ? documentId || undefined : undefined,
          expectedVersion: current?.version ?? 1,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(`${applyKind} posted. Remaining ${result.data.remaining.toFixed(2)}.`);
        router.refresh();
      });
    });
  }

  return (
    <div className="workspace">
      <Card>
        <div className="card-header">
          <div>
            <p className="eyebrow">Advances</p>
            <h1 className="card-title" style={{ marginTop: 4 }}>
              Unapplied money
            </h1>
            <p className="card-subtitle">
              Customer receipts stay a liability until applied. Supplier and staff issues stay an asset until settled. These examples are non-VAT.
            </p>
          </div>
        </div>
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
          {canWrite ? (
            <form onSubmit={issue} className="form-grid">
              <div className="field">
                <label htmlFor="adv-kind">Kind</label>
                <select
                  id="adv-kind"
                  value={kind}
                  onChange={(e) => {
                    const next = e.target.value as AdvanceKind;
                    setKind(next);
                    const first = parties.find((p) =>
                      next === 'customer'
                        ? p.kind === 'customer' || p.isCustomer === '1'
                        : next === 'supplier'
                          ? p.kind === 'vendor' || p.isVendor === '1'
                          : p.kind === 'staff',
                    );
                    if (first) setPartyId(first.id);
                  }}
                >
                  <option value="customer">Customer advance</option>
                  <option value="supplier">Supplier advance</option>
                  <option value="staff">Staff advance</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="adv-party">Party</label>
                <select id="adv-party" value={partyId} onChange={(e) => setPartyId(e.target.value)} required>
                  {filteredParties.map((party) => (
                    <option key={party.id} value={party.id}>
                      {party.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="adv-amount">Amount</label>
                <input id="adv-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required />
              </div>
              <div className="field">
                <label htmlFor="adv-date">Date</label>
                <input id="adv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="adv-cash">Cash/bank code</label>
                <input id="adv-cash" value={cashCode} onChange={(e) => setCashCode(e.target.value)} />
              </div>
              <Button variant="primary" type="submit" disabled={pending || filteredParties.length === 0}>
                Issue advance
              </Button>
            </form>
          ) : (
            <p>You can view advances. Issuing or applying needs payment or simple-entry write access.</p>
          )}
          {canWrite ? (
            <form onSubmit={apply} className="form-grid" style={{ marginTop: 24 }}>
              <div className="field">
                <label htmlFor="adv-open">Open advance</label>
                <select id="adv-open" value={applyId} onChange={(e) => setApplyId(e.target.value)}>
                  {advances.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.partyName} · {row.kind} · remaining {row.remaining.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="adv-apply-kind">Action</label>
                <select id="adv-apply-kind" value={applyKind} onChange={(e) => setApplyKind(e.target.value as typeof applyKind)}>
                  {selectedAdvance?.kind === 'staff' ? (
                    <>
                      <option value="expense_settle">Staff expense settlement</option>
                      <option value="return_cash">Staff unused cash return</option>
                    </>
                  ) : (
                    <>
                      <option value="apply">Apply to invoice or bill</option>
                      <option value="refund">Refund unused</option>
                    </>
                  )}
                </select>
              </div>
              {applyKind === 'apply' ? (
                <div className="field">
                  <label htmlFor="adv-doc">Invoice or bill</label>
                  <select id="adv-doc" value={documentId} onChange={(e) => setDocumentId(e.target.value)} required>
                    <option value="">Select a document</option>
                    {eligibleDocuments.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.documentNumber} · due {doc.balanceDue.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="field">
                <label htmlFor="adv-apply-amt">Amount</label>
                <input id="adv-apply-amt" value={applyAmount} onChange={(e) => setApplyAmount(e.target.value)} inputMode="decimal" />
              </div>
              <Button type="submit" disabled={pending || advances.length === 0}>
                Post allocation
              </Button>
            </form>
          ) : null}
          <div className="table-wrap" style={{ marginTop: 24 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Kind</th>
                  <th>Party</th>
                  <th style={{ textAlign: 'right' }}>Issued</th>
                  <th style={{ textAlign: 'right' }}>Remaining</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {advances.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No advances yet.</td>
                  </tr>
                ) : (
                  advances.map((row) => (
                    <tr key={row.id}>
                      <td>{row.issuedOn}</td>
                      <td>{row.kind}</td>
                      <td>{row.partyName}</td>
                      <td style={{ textAlign: 'right' }}>{row.issued.toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{row.remaining.toFixed(2)}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
