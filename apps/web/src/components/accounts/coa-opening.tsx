'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/bookone-ui';
import { DateField } from '@/components/ui/date-field';
import { FormFooter, FormShell } from '@/components/ui/form-shell';
import { SelectField } from '@/components/ui/select-field';
import { AmountField } from '@/components/ui/text-field';
import { withFormPending } from '@/components/ui/form-busy';
import { postOpeningBalances, previewOpening } from '@/app/actions/opening-balances';

type Line = { id: string; accountCode: string; debit: string; credit: string };

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `line-${Date.now()}-${Math.random()}`;
}

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function CoaOpening({
  accounts,
}: {
  accounts: Array<{ code: string; name: string; isGroup?: string | null }>;
}) {
  const router = useRouter();
  const posting = accounts.filter((row) => row.isGroup !== '1');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([{ id: newId(), accountCode: posting[0]?.code ?? '', debit: '', credit: '' }]);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const accountOptions = posting.map((account) => ({
    value: account.code,
    label: `${account.code} · ${account.name}`,
  }));

  function payloadKey() {
    return JSON.stringify({ date, lines: lines.map((line) => ({ accountCode: line.accountCode, debit: line.debit, credit: line.credit })) });
  }

  function parsed() {
    return lines.map((line) => ({
      accountCode: line.accountCode,
      debit: parseAmount(line.debit) ?? Number.NaN,
      credit: parseAmount(line.credit) ?? Number.NaN,
    }));
  }

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const line of lines) {
      debit += parseAmount(line.debit) ?? 0;
      credit += parseAmount(line.credit) ?? 0;
    }
    return { debit, credit, diff: Math.round((debit - credit) * 100) / 100 };
  }, [lines]);

  const stale = Boolean(previewKey && previewKey !== payloadKey());
  const postReason = !previewKey
    ? 'Preview this exact date and these lines before posting.'
    : stale
      ? 'Lines or date changed. Preview again before posting.'
      : null;

  function runPreview() {
    setError(null);
    const invalid = parsed().find((line) => Number.isNaN(line.debit) || Number.isNaN(line.credit));
    if (invalid) {
      setError('Enter amounts as numbers with up to two decimal places. Blank is zero.');
      return;
    }
    start(() => {
      void (async () => {
        const result = await previewOpening({ effectiveDate: date, lines: parsed() });
        if (!result.ok) {
          setError(result.error);
          setPreviewText(null);
          setPreviewKey(null);
          return;
        }
        setPreviewKey(payloadKey());
        setPreviewText(
          `Balanced preview: debits ${result.data.debitTotal.toFixed(2)} / credits ${result.data.creditTotal.toFixed(2)}. One posting will be created.`,
        );
      })();
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (stale || !previewKey) {
      setError('Preview this exact date and these lines before posting.');
      return;
    }
    start(() => {
      void withFormPending(async () => {
        const preview = await previewOpening({ effectiveDate: date, lines: parsed() });
        if (!preview.ok) {
          setError(preview.error);
          return;
        }
        const result = await postOpeningBalances({ effectiveDate: date, lines: parsed() });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push('/accounts');
        router.refresh();
      });
    });
  }

  return (
    <FormShell
      backHref="/accounts"
      backParent="Accounts"
      title="Opening balances"
      size="wide"
      footer={
        <FormFooter>
          {postReason ? (
            <p className="field-help" id="open-post-reason">
              {postReason}
            </p>
          ) : null}
          <Button type="button" onClick={() => router.push('/accounts')}>
            Cancel
          </Button>
          <Button type="button" onClick={runPreview} disabled={pending}>
            Preview
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="coa-opening"
            disabled={pending || !previewKey || stale}
            aria-describedby={postReason ? 'open-post-reason' : undefined}
          >
            Post opening
          </Button>
        </FormFooter>
      }
    >
      <form id="coa-opening" onSubmit={submit}>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {stale ? (
          <p className="form-error" role="status">
            Lines or date changed. Preview again before posting.
          </p>
        ) : null}
        <p className="field-help" style={{ marginBottom: 12 }}>
          Creating an account does not write equity or journals. Preview must balance before posting.
        </p>
        <DateField id="open-date" label="Effective date" value={date} onChange={setDate} required className="opening-date" />
        <div className="opening-editor">
          <div className="opening-line-head" aria-hidden>
            <span>Account</span>
            <span className="num">Debit</span>
            <span className="num">Credit</span>
            <span />
          </div>
          {lines.map((line, index) => (
            <div key={line.id} className="opening-line-grid" data-line={index + 1}>
              <SelectField
                id={`open-code-${line.id}`}
                label={`Account, line ${index + 1}`}
                value={line.accountCode}
                onChange={(accountCode) => setLines((cur) => cur.map((row) => (row.id === line.id ? { ...row, accountCode } : row)))}
                options={accountOptions}
                emptyReason="No posting accounts are available."
              />
              <AmountField
                id={`open-dr-${line.id}`}
                label={`Debit, line ${index + 1}`}
                value={line.debit}
                onChange={(e) => setLines((cur) => cur.map((row) => (row.id === line.id ? { ...row, debit: e.target.value } : row)))}
              />
              <AmountField
                id={`open-cr-${line.id}`}
                label={`Credit, line ${index + 1}`}
                value={line.credit}
                onChange={(e) => setLines((cur) => cur.map((row) => (row.id === line.id ? { ...row, credit: e.target.value } : row)))}
              />
              <div className="opening-action">
                <Button
                  id={`open-remove-${line.id}`}
                  className="opening-remove"
                  type="button"
                  disabled={lines.length <= 1}
                  aria-label={`Remove line ${index + 1}`}
                  onClick={() => setLines((cur) => cur.filter((row) => row.id !== line.id))}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <div className="opening-review">
            <span>Totals</span>
            <span className="num">Debits {totals.debit.toFixed(2)}</span>
            <span className="num">Credits {totals.credit.toFixed(2)}</span>
            <span>Diff {totals.diff.toFixed(2)}</span>
          </div>
          {previewText && !stale ? (
            <p className="form-success" role="status">
              {previewText}
            </p>
          ) : null}
          <div className="opening-editor-actions">
            <Button
              type="button"
              onClick={() =>
                setLines((cur) => [...cur, { id: newId(), accountCode: posting[0]?.code ?? '', debit: '', credit: '' }])
              }
            >
              Add line
            </Button>
          </div>
        </div>
      </form>
    </FormShell>
  );
}
