'use client';

import { useState, useTransition } from 'react';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarDays,
  Camera,
  CheckCircle2,
  FileText,
  Landmark,
  Loader2,
  ReceiptText,
  Upload,
  XCircle,
} from 'lucide-react';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button, Card, SelectLike } from '@/components/ui/bookone-ui';
import { recordEntry, type RecordEntryResult } from '@/app/actions/record-entry';
import type { EntryInput } from '@/lib/entry-schema';

type Direction = 'money_in' | 'money_out' | 'move_money' | 'invoice_bill';

const entryModes: { title: string; hint: string; icon: typeof ArrowDownLeft; direction: Direction }[] = [
  { title: 'Money In', hint: 'Received money', icon: ArrowDownLeft, direction: 'money_in' },
  { title: 'Money Out', hint: 'Paid or spent money', icon: ArrowUpRight, direction: 'money_out' },
  { title: 'Move Money', hint: 'Transfer funds', icon: ArrowRightLeft, direction: 'move_money' },
  { title: 'Invoice/Bill', hint: 'Pay later', icon: FileText, direction: 'invoice_bill' },
];

const PARTY_LABELS: Record<Direction, string> = {
  money_in: 'From whom',
  money_out: 'Paid to',
  move_money: 'Memo',
  invoice_bill: 'Customer / Vendor',
};

const ACCOUNT_LABEL: Record<Direction, string> = {
  money_in: 'Received to',
  money_out: 'Paid from',
  move_money: 'To account',
  invoice_bill: 'Payment terms',
};

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Home() {
  const [direction, setDirection] = useState<Direction>('money_out');
  const [party, setParty] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [description, setDescription] = useState('');
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<RecordEntryResult | null>(null);

  const partyLabel = PARTY_LABELS[direction];
  const accountLabel = ACCOUNT_LABEL[direction];
  const actionLabel =
    direction === 'money_in' ? 'Record Money In' :
    direction === 'move_money' ? 'Record Transfer' :
    direction === 'invoice_bill' ? 'Create Document' : 'Record Money Out';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    const amount = parseFloat(amountStr.replace(/[^0-9.]/g, ''));
    if (isNaN(amount) || amount <= 0) return;

    const base = {
      party: party.trim(),
      description: description.trim(),
      amount,
      currency: 'LKR' as const,
      paymentMethod: 'Bank' as const,
      paymentAccount: { kind: 'code' as const, value: '1100' },
      date: todayString(),
    };

    let input: EntryInput;
    if (direction === 'money_out') {
      input = { direction: 'money_out', ...base };
    } else if (direction === 'money_in') {
      input = { direction: 'money_in', moneyInType: 'new_sale', ...base };
    } else if (direction === 'move_money') {
      input = {
        direction: 'move_money',
        fromAccount: { kind: 'code', value: '1000' },
        toAccount: { kind: 'code', value: '1100' },
        ...base,
      };
    } else {
      input = { direction: 'invoice_bill', invoiceType: 'customer_invoice', ...base };
    }

    startTransition(() => {
      recordEntry(input).then(setResult);
    });
  }

  return (
    <BookOneShell active="Simple Entry">
      <div className="entry-screen">
        <Card className="entry-card">
          <form onSubmit={handleSubmit}>
            <div className="entry-card-header">
              <div>
                <p className="eyebrow">Simple entry</p>
                <h1>Record what happened</h1>
              </div>
              <Badge tone={result?.success ? 'success' : result?.error ? 'danger' : 'success'}>
                {result?.success ? <CheckCircle2 size={13} /> : result?.error ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                {result?.success ? 'Recorded' : result?.error ? 'Error' : 'Ready'}
              </Badge>
            </div>

            <div className="entry-section">
              <label className="entry-label">What happened?</label>
              <div className="entry-mode-row">
                {entryModes.map((mode) => (
                  <button
                    className={`entry-mode ${mode.direction === direction ? 'active' : ''}`}
                    type="button"
                    key={mode.direction}
                    onClick={() => setDirection(mode.direction)}
                  >
                    <mode.icon size={18} />
                    <strong>{mode.title}</strong>
                    <span>{mode.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="entry-form">
              <div className="field">
                <label>{partyLabel}</label>
                <input
                  className="input large"
                  value={party}
                  onChange={(e) => setParty(e.target.value)}
                  placeholder={direction === 'money_out' ? 'Supplier name' : 'Name'}
                  required
                />
              </div>
              <div className="field">
                <label>Amount</label>
                <input
                  className="input large"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="1,500.00"
                  required
                />
              </div>
              <div className="field field-full">
                <label>What was it for?</label>
                <input
                  className="input large"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Office supplies, rent, Facebook ads"
                  required
                />
              </div>
              <div className="field">
                <label>{accountLabel}</label>
                <SelectLike>
                  <span className="cluster"><Landmark size={16} /> Commercial Bank</span>
                </SelectLike>
              </div>
              <div className="field">
                <label>Date</label>
                <SelectLike>
                  <span className="cluster"><CalendarDays size={16} /> Today</span>
                </SelectLike>
              </div>
            </div>

            <div className="entry-receipt">
              <div className="cluster">
                <ReceiptText size={18} color="var(--brand)" />
                <div>
                  <strong>Receipt</strong>
                  <span>Optional, but useful for records.</span>
                </div>
              </div>
              <div className="cluster">
                <Button variant="secondary" type="button"><Camera size={16} /> Photo</Button>
                <Button variant="secondary" type="button"><Upload size={16} /> Upload</Button>
              </div>
            </div>

            {result?.error ? (
              <p style={{ marginTop: 14, color: 'var(--danger)', fontSize: 13 }}>{result.error}</p>
            ) : null}

            {result?.success ? (
              <p style={{ marginTop: 14, color: 'var(--success)', fontSize: 13 }}>
                Entry recorded. Journal #{result.journalId?.slice(0, 8)} created.
              </p>
            ) : null}

            <div className="entry-footer">
              <span>BookOne automatically creates the journal and audit record.</span>
              <Button variant="primary" type="submit" disabled={isPending}>
                {isPending ? <Loader2 size={16} /> : null}
                {isPending ? 'Recording\u2026' : actionLabel}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </BookOneShell>
  );
}
