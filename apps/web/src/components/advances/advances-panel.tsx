'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui/bookone-ui';
import { DateField } from '@/components/ui/date-field';
import { FormBackLink } from '@/components/ui/form-shell';
import { SelectField } from '@/components/ui/select-field';
import { AmountField } from '@/components/ui/text-field';
import { withFormPending } from '@/components/ui/form-busy';
import { applyPartyAdvance, issuePartyAdvance } from '@/app/actions/advances';
import { applyKindLabel, kindLabel } from '@/lib/coa-labels';
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
type CashOption = { code: string; name: string };

export function AdvancesPanel({
  advances,
  parties,
  documents,
  cashAccounts,
  canWrite,
}: {
  advances: AdvanceRow[];
  parties: PartyOption[];
  documents: DocumentOption[];
  cashAccounts: CashOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<AdvanceKind>('customer');
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashCode, setCashCode] = useState(cashAccounts[0]?.code ?? '');
  const [applyId, setApplyId] = useState('');
  const [applyAmount, setApplyAmount] = useState('');
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
    if (!filteredParties.some((p) => p.id === partyId)) {
      setPartyId('');
    }
  }, [filteredParties, partyId]);

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
        setMessage(`${kindLabel(kind)} recorded. Remaining ${result.data.remaining.toFixed(2)}.`);
        setAmount('');
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
        setMessage(`${applyKindLabel(applyKind)} posted. Remaining ${result.data.remaining.toFixed(2)}.`);
        setApplyAmount('');
        router.refresh();
      });
    });
  }

  const partyEmpty =
    kind === 'customer'
      ? 'No customer parties in this company. Add a customer before issuing an advance.'
      : kind === 'supplier'
        ? 'No supplier parties in this company. Add a vendor before issuing an advance.'
        : 'No staff parties in this company. Add a staff person before issuing an advance.';

  return (
    <div className="workspace party-workspace">
      <div className="party-form-top" style={{ marginBottom: 12, borderRadius: 'var(--radius-lg)' }}>
        <FormBackLink href="/accounts" parent="Accounts" />
        <span className="form-shell-title">Advances</span>
      </div>
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
        <Card>
          <div className="card-header">
            <div>
              <h2 className="card-title">Issue an advance</h2>
              <p className="card-subtitle">
                Customer receipts stay a liability until applied. Supplier and staff issues stay an asset until settled. These examples are non-VAT.
              </p>
            </div>
          </div>
          <div className="card-body">
            <form onSubmit={issue} className="party-tab-grid">
              <SelectField
                id="adv-kind"
                label="Kind"
                value={kind}
                onChange={(v) => setKind(v as AdvanceKind)}
                options={[
                  { value: 'customer', label: 'Customer advance' },
                  { value: 'supplier', label: 'Supplier advance' },
                  { value: 'staff', label: 'Staff advance' },
                ]}
              />
              <SelectField
                id="adv-party"
                label="Party"
                value={partyId}
                onChange={setPartyId}
                options={filteredParties.map((party) => ({ value: party.id, label: party.name }))}
                emptyReason={partyEmpty}
                required
              />
              <AmountField id="adv-amount" label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              <DateField id="adv-date" label="Date" value={date} onChange={setDate} required />
              <SelectField
                id="adv-cash"
                label="Cash or bank"
                className="field-full"
                value={cashCode}
                onChange={setCashCode}
                options={cashAccounts.map((row) => ({ value: row.code, label: `${row.code} · ${row.name}` }))}
                emptyReason="No spendable cash or bank accounts are available."
                help="Uses the account code the server validates. Card clearing is not listed."
              />
              <div className="field field-full">
                <Button variant="primary" type="submit" disabled={pending || filteredParties.length === 0 || cashAccounts.length === 0}>
                  Issue advance
                </Button>
              </div>
            </form>
          </div>
        </Card>
      ) : (
        <p>You can view advances. Issuing or applying needs payment or simple-entry write access.</p>
      )}
      {canWrite ? (
        <Card style={{ marginTop: 16 }}>
          <div className="card-header">
            <div>
              <h2 className="card-title">Allocate or settle</h2>
              <p className="card-subtitle">Apply a customer or supplier advance to an eligible document, or settle staff with an expense or unused cash.</p>
            </div>
          </div>
          <div className="card-body">
            <form onSubmit={apply} className="party-tab-grid">
              <SelectField
                id="adv-open"
                label="Open advance"
                className="field-full"
                value={applyId}
                onChange={setApplyId}
                options={advances.map((row) => ({
                  value: row.id,
                  label: `${row.partyName} · ${kindLabel(row.kind)} · remaining ${row.remaining.toFixed(2)}`,
                }))}
                emptyReason="No open advances to allocate."
              />
              <SelectField
                id="adv-apply-kind"
                label="Action"
                value={applyKind}
                onChange={(v) => setApplyKind(v as typeof applyKind)}
                options={
                  selectedAdvance?.kind === 'staff'
                    ? [
                        { value: 'expense_settle', label: 'Staff expense settlement' },
                        { value: 'return_cash', label: 'Unused cash returned' },
                      ]
                    : [
                        { value: 'apply', label: 'Apply to invoice or bill' },
                        { value: 'refund', label: 'Refund unused' },
                      ]
                }
                disabled={!selectedAdvance}
                disabledReason="Select an open advance first."
              />
              {applyKind === 'apply' ? (
                <SelectField
                  id="adv-doc"
                  label="Invoice or bill"
                  className="field-full"
                  value={documentId}
                  onChange={setDocumentId}
                  options={eligibleDocuments.map((doc) => ({
                    value: doc.id,
                    label: `${doc.documentNumber} · due ${doc.balanceDue.toFixed(2)}`,
                  }))}
                  emptyReason={
                    selectedAdvance
                      ? 'No eligible open invoice or bill for this party. Staff advances cannot apply to documents.'
                      : 'Select an open advance first.'
                  }
                />
              ) : null}
              <AmountField id="adv-apply-amt" label="Amount" value={applyAmount} onChange={(e) => setApplyAmount(e.target.value)} />
              <div className="field field-full">
                <Button type="submit" disabled={pending || advances.length === 0 || !applyId}>
                  Post allocation
                </Button>
              </div>
            </form>
          </div>
        </Card>
      ) : null}
      <Card style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">Open advances</h2>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrap">
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
                      <td>{kindLabel(row.kind)}</td>
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
