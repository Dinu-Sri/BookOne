'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui/bookone-ui';
import { withFormPending } from '@/components/ui/form-busy';
import { postOpeningBalances, previewOpening } from '@/app/actions/opening-balances';

type Line = { accountCode: string; debit: string; credit: string };

export function CoaOpening({
  accounts,
}: {
  accounts: Array<{ code: string; name: string; isGroup?: string | null }>;
}) {
  const router = useRouter();
  const posting = accounts.filter((row) => row.isGroup !== '1');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([{ accountCode: posting[0]?.code ?? '1000', debit: '', credit: '' }]);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function parsed() {
    return lines.map((line) => ({
      accountCode: line.accountCode,
      debit: Number(line.debit) || 0,
      credit: Number(line.credit) || 0,
    }));
  }

  function runPreview() {
    setError(null);
    start(() => {
      void (async () => {
        const result = await previewOpening({ effectiveDate: date, lines: parsed() });
        if (!result.ok) {
          setError(result.error);
          setPreviewText(null);
          return;
        }
        setPreviewText(
          `Balanced preview: debits ${result.data.debitTotal.toFixed(2)} / credits ${result.data.creditTotal.toFixed(2)}. One posting will be created.`,
        );
      })();
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
    <Card>
      <div className="card-header">
        <div>
          <p className="eyebrow">Opening balances</p>
          <h1 className="card-title" style={{ marginTop: 4 }}>
            Post a balanced opening
          </h1>
          <p className="card-subtitle">
            Creating an account does not write equity or journals. Preview must balance before posting.
          </p>
        </div>
      </div>
      <div className="card-body">
        <form onSubmit={submit} className="form-grid">
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {previewText ? (
            <p className="form-success" role="status">
              {previewText}
            </p>
          ) : null}
          <div className="field">
            <label htmlFor="open-date">Effective date</label>
            <input id="open-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          {lines.map((line, index) => (
            <div key={index} className="cluster" style={{ gap: 8, flexWrap: 'wrap' }}>
              <div className="field">
                <label htmlFor={`open-code-${index}`}>Account</label>
                <select
                  id={`open-code-${index}`}
                  value={line.accountCode}
                  onChange={(e) =>
                    setLines((cur) => cur.map((row, i) => (i === index ? { ...row, accountCode: e.target.value } : row)))
                  }
                >
                  {posting.map((account) => (
                    <option key={account.code} value={account.code}>
                      {account.code} {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`open-dr-${index}`}>Debit</label>
                <input
                  id={`open-dr-${index}`}
                  inputMode="decimal"
                  value={line.debit}
                  onChange={(e) => setLines((cur) => cur.map((row, i) => (i === index ? { ...row, debit: e.target.value } : row)))}
                />
              </div>
              <div className="field">
                <label htmlFor={`open-cr-${index}`}>Credit</label>
                <input
                  id={`open-cr-${index}`}
                  inputMode="decimal"
                  value={line.credit}
                  onChange={(e) => setLines((cur) => cur.map((row, i) => (i === index ? { ...row, credit: e.target.value } : row)))}
                />
              </div>
            </div>
          ))}
          <div className="cluster" style={{ gap: 8 }}>
            <Button type="button" onClick={() => setLines((cur) => [...cur, { accountCode: posting[0]?.code ?? '1000', debit: '', credit: '' }])}>
              Add line
            </Button>
            <Button type="button" onClick={runPreview} disabled={pending}>
              Preview
            </Button>
            <Button variant="primary" type="submit" disabled={pending}>
              Post opening
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
