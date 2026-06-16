'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  FileText,
  Landmark,
  Loader2,
  Paperclip,
  ReceiptText,
  Sparkles,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button, Card } from '@/components/ui/bookone-ui';
import { recordEntry, type RecordEntryResult } from '@/app/actions/record-entry';
import {
  getActiveAccounts,
  type AccountOption,
} from '@/app/actions/accounts';
import { previewCategory, type CategoryPreview } from '@/app/actions/preview-category';
import { uploadReceipt } from '@/app/actions/upload-receipt';
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
  invoice_bill: 'Settle to',
};

const PAYMENT_METHODS = ['Cash', 'Bank', 'Card', 'Online', 'Credit'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Account code → likely payment method mapping
const PAYMENT_HINT: Record<string, PaymentMethod> = {
  '1000': 'Cash',
  '1100': 'Bank',
  '1200': 'Card',
};

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

interface UploadedReceipt {
  key: string;
  name: string;
  size: number;
}

export default function Home() {
  const [direction, setDirection] = useState<Direction>('money_out');
  const [party, setParty] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState<string>(todayString());
  const [paymentAccountCode, setPaymentAccountCode] = useState<string>('1100');
  const [fromAccountCode, setFromAccountCode] = useState<string>('1000');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Bank');
  const [categoryOverride, setCategoryOverride] = useState<string>('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const [accountList, setAccountList] = useState<AccountOption[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [categoryPreview, setCategoryPreview] = useState<CategoryPreview | null>(null);
  const [receipt, setReceipt] = useState<UploadedReceipt | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<RecordEntryResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const partyLabel = PARTY_LABELS[direction];
  const accountLabel = ACCOUNT_LABEL[direction];
  const actionLabel =
    direction === 'money_in' ? 'Record Money In' :
    direction === 'move_money' ? 'Record Transfer' :
    direction === 'invoice_bill' ? 'Create Document' : 'Record Money Out';

  // Load accounts on mount
  useEffect(() => {
    let cancelled = false;
    setAccountsLoading(true);
    getActiveAccounts()
      .then((rows) => {
        if (cancelled) return;
        setAccountList(rows);
        setAccountsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load accounts:', err);
        setAccountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const liquidAccounts = useMemo(
    () => accountList.filter((a) => a.type === 'asset' && ['1000', '1100', '1200', '1300'].includes(a.code)),
    [accountList],
  );
  const expenseAccounts = useMemo(
    () => accountList.filter((a) => a.type === 'expense' || a.code === '3100'),
    [accountList],
  );
  const revenueAccounts = useMemo(
    () => accountList.filter((a) => a.type === 'revenue'),
    [accountList],
  );

  // Auto-pick payment method when the account changes
  useEffect(() => {
    const hint = PAYMENT_HINT[paymentAccountCode];
    if (hint) setPaymentMethod(hint);
  }, [paymentAccountCode]);

  // Live category preview (debounced)
  useEffect(() => {
    if (description.trim().length < 2) {
      setCategoryPreview(null);
      return;
    }
    const handle = setTimeout(() => {
      const invoiceType: 'customer_invoice' | 'vendor_bill' | undefined =
        direction === 'invoice_bill' ? 'vendor_bill' : undefined;
      previewCategory({
        description: description.trim(),
        party: party.trim(),
        direction,
        invoiceType,
        categoryOverride: categoryOverride || undefined,
      })
        .then(setCategoryPreview)
        .catch(() => setCategoryPreview(null));
    }, 350);
    return () => clearTimeout(handle);
  }, [description, party, direction, categoryOverride]);

  function clearForm() {
    setParty('');
    setAmountStr('');
    setDescription('');
    setDate(todayString());
    setCategoryOverride('');
    setShowCategoryPicker(false);
    setReceipt(null);
    setUploadError(null);
    setResult(null);
  }

  async function handleFileUpload(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const out = await uploadReceipt(fd);
      if (!out.ok || !out.receiptRef) {
        setUploadError(out.error ?? 'Upload failed.');
        return;
      }
      setReceipt({
        key: out.receiptRef,
        name: file.name,
        size: file.size,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFileUpload(file);
    e.target.value = '';
  }

  function removeReceipt() {
    setReceipt(null);
    setUploadError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    const amount = parseFloat(amountStr.replace(/[^0-9.]/g, ''));
    if (isNaN(amount) || amount <= 0) return;
    if (!paymentAccountCode) return;

    const base = {
      party: party.trim(),
      description: description.trim(),
      amount,
      currency: 'LKR' as const,
      paymentMethod,
      paymentAccount: { kind: 'code' as const, value: paymentAccountCode },
      date,
      receiptRef: receipt?.key,
    };

    let input: EntryInput;
    if (direction === 'money_out') {
      input = {
        direction: 'money_out',
        ...base,
        ...(categoryOverride ? { categoryOverride } : {}),
      };
    } else if (direction === 'money_in') {
      input = {
        direction: 'money_in',
        moneyInType: 'new_sale',
        ...base,
        ...(categoryOverride ? { categoryOverride } : {}),
      };
    } else if (direction === 'move_money') {
      input = {
        direction: 'move_money',
        fromAccount: { kind: 'code', value: fromAccountCode },
        toAccount: { kind: 'code', value: paymentAccountCode },
        ...base,
      };
    } else {
      input = {
        direction: 'invoice_bill',
        invoiceType: 'customer_invoice',
        ...base,
        ...(categoryOverride ? { categoryOverride } : {}),
      };
    }

    startTransition(() => {
      recordEntry(input).then((res) => {
        setResult(res);
        if (res.success) {
          clearForm();
        }
      });
    });
  }

  const showCategorySection = direction === 'money_out' || direction === 'invoice_bill';
  const showFromAccount = direction === 'move_money';

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
                    onClick={() => {
                      setDirection(mode.direction);
                      setResult(null);
                    }}
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
                  placeholder={
                    direction === 'money_out' ? 'Supplier name' :
                    direction === 'money_in' ? 'Customer or source' :
                    direction === 'move_money' ? 'Reference / memo' :
                    'Customer or vendor name'
                  }
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
                  inputMode="decimal"
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
              {showFromAccount ? (
                <div className="field">
                  <label>From account</label>
                  <AccountSelect
                    value={fromAccountCode}
                    onChange={setFromAccountCode}
                    accounts={liquidAccounts}
                    disabled={accountsLoading}
                  />
                </div>
              ) : null}
              <div className="field">
                <label>{accountLabel}</label>
                <AccountSelect
                  value={paymentAccountCode}
                  onChange={setPaymentAccountCode}
                  accounts={liquidAccounts}
                  disabled={accountsLoading}
                />
              </div>
              <div className="field">
                <label>Payment method</label>
                <select
                  className="input"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Date</label>
                <div className="date-field">
                  <CalendarDays size={16} />
                  <input
                    className="input"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    max={todayString()}
                  />
                </div>
              </div>
            </div>

            {showCategorySection ? (
              <div className="entry-suggestion">
                <div>
                  <span>
                    {categoryPreview
                      ? categoryPreview.source === 'override'
                        ? 'Overridden category'
                        : 'Inferred category'
                      : 'Category'}
                  </span>
                  <strong>
                    {categoryPreview
                      ? `${categoryPreview.accountName} (${Math.round(categoryPreview.confidence * 100)}%)`
                      : 'Type a description to see the inferred category…'}
                  </strong>
                </div>
                {categoryPreview ? (
                  <ProgressInline value={Math.round(categoryPreview.confidence * 100)} />
                ) : null}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setShowCategoryPicker((v) => !v)}
                >
                  {showCategoryPicker ? 'Hide override' : 'Override'}
                </button>
              </div>
            ) : null}

            {showCategorySection && showCategoryPicker ? (
              <div className="category-picker">
                <span className="entry-label">Pick the right account</span>
                <div className="suggestion-list">
                  <button
                    type="button"
                    className={`chip ${!categoryOverride ? 'active' : ''}`}
                    onClick={() => setCategoryOverride('')}
                  >
                    <Sparkles size={12} /> Auto
                  </button>
                  {(direction === 'money_out'
                    ? expenseAccounts
                    : expenseAccounts.concat(revenueAccounts)
                  ).map((acc) => (
                    <button
                      type="button"
                      key={acc.id}
                      className={`chip ${categoryOverride === acc.code ? 'active' : ''}`}
                      onClick={() => setCategoryOverride(acc.code)}
                    >
                      {acc.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="entry-receipt">
              {receipt ? (
                <>
                  <div className="cluster">
                    <Paperclip size={18} color="var(--brand)" />
                    <div>
                      <strong>{receipt.name}</strong>
                      <span>{(receipt.size / 1024).toFixed(0)} KB · stored privately in R2</span>
                    </div>
                  </div>
                  <Button variant="secondary" type="button" onClick={removeReceipt} aria-label="Remove receipt">
                    <X size={16} /> Remove
                  </Button>
                </>
              ) : (
                <>
                  <div className="cluster">
                    <ReceiptText size={18} color="var(--brand)" />
                    <div>
                      <strong>Receipt</strong>
                      <span>Optional. JPEG, PNG, WebP, HEIC, or PDF up to 10 MB.</span>
                    </div>
                  </div>
                  <div className="cluster">
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? <Loader2 size={16} /> : <Camera size={16} />} Photo
                    </Button>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? <Loader2 size={16} /> : <Upload size={16} />} Upload
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                      hidden
                      onChange={onFileSelected}
                    />
                  </div>
                </>
              )}
            </div>
            {uploadError ? (
              <p style={{ marginTop: 10, color: 'var(--danger)', fontSize: 13 }}>{uploadError}</p>
            ) : null}

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
              <Button variant="primary" type="submit" disabled={isPending || accountsLoading}>
                {isPending ? <Loader2 size={16} /> : null}
                {isPending ? 'Recording…' : actionLabel}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </BookOneShell>
  );
}

function AccountSelect({
  value,
  onChange,
  accounts,
  disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  accounts: AccountOption[];
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div className="select-like" aria-busy>
        <span className="cluster" style={{ color: 'var(--ink-soft)' }}>
          <Landmark size={16} /> Loading accounts…
        </span>
        <ChevronDown size={14} />
      </div>
    );
  }
  return (
    <select
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Select account"
    >
      {accounts.length === 0 ? (
        <option value="">No accounts available</option>
      ) : null}
      {accounts.map((a) => (
        <option key={a.id} value={a.code}>
          {a.code} — {a.name}
        </option>
      ))}
    </select>
  );
}

function ProgressInline({ value }: { value: number }) {
  return (
    <div className="confidence" aria-label={`${value}%`} style={{ width: 80 }}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
