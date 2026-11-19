'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui/bookone-ui';
import { withFormPending } from '@/components/ui/form-busy';
import { dryRunChartCsv, importChartCsv } from '@/app/actions/chart-of-accounts';

export function CoaImport() {
  const router = useRouter();
  const [text, setText] = useState('code,name,type,subtype,parent_code,description,is_group\n');
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function dryRun() {
    setError(null);
    start(() => {
      void (async () => {
        const result = await dryRunChartCsv(text);
        if (!result.ok) {
          setError(result.error);
          setSummary(null);
          return;
        }
        setSummary(
          `Dry-run: ${result.data.creates} to create, ${result.data.skipped} already present, ${result.data.issues.length} issues.`,
        );
        if (result.data.issues[0]) setError(result.data.issues[0].message);
      })();
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(() => {
      void withFormPending(async () => {
        const result = await importChartCsv(text);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSummary(`Imported ${result.data.created} accounts (${result.data.skipped} skipped).`);
        router.refresh();
      });
    });
  }

  return (
    <Card>
      <div className="card-header">
        <div>
          <p className="eyebrow">Chart import</p>
          <h1 className="card-title" style={{ marginTop: 4 }}>
            CSV template
          </h1>
          <p className="card-subtitle">Metadata only. Monetary openings use the opening-balances screen.</p>
        </div>
      </div>
      <div className="card-body">
        <form onSubmit={submit} className="form-grid">
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {summary ? (
            <p className="form-success" role="status">
              {summary}
            </p>
          ) : null}
          <div className="field field-full">
            <label htmlFor="coa-csv">CSV</label>
            <textarea id="coa-csv" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="cluster" style={{ gap: 8 }}>
            <Button type="button" onClick={dryRun} disabled={pending}>
              Dry-run
            </Button>
            <Button variant="primary" type="submit" disabled={pending}>
              Import
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
