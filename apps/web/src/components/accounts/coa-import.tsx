'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/bookone-ui';
import { FormFooter, FormShell } from '@/components/ui/form-shell';
import { TextAreaField } from '@/components/ui/text-field';
import { withFormPending } from '@/components/ui/form-busy';
import { dryRunChartCsv, importChartCsv } from '@/app/actions/chart-of-accounts';

type Issue = { line?: number; field?: string; message: string };

export function CoaImport() {
  const router = useRouter();
  const [text, setText] = useState('code,name,type,subtype,parent_code,description,is_group\n');
  const [summary, setSummary] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
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
          setIssues([]);
          return;
        }
        setIssues(result.data.issues ?? []);
        setSummary(
          `Dry-run: ${result.data.creates} to create, ${result.data.skipped} already present, ${(result.data.issues ?? []).length} issues.`,
        );
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
        setIssues([]);
        setSummary(`Imported ${result.data.created} accounts (${result.data.skipped} skipped).`);
        router.refresh();
      });
    });
  }

  return (
    <FormShell
      backHref="/accounts"
      backParent="Accounts"
      title="Import chart CSV"
      size="wide"
      footer={
        <FormFooter>
          <Button type="button" onClick={() => router.push('/accounts')}>
            Cancel
          </Button>
          <Button type="button" onClick={dryRun} disabled={pending}>
            Dry-run
          </Button>
          <Button variant="primary" type="submit" form="coa-import" disabled={pending}>
            Import
          </Button>
        </FormFooter>
      }
    >
      <form id="coa-import" onSubmit={submit}>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="import-guide">
          Metadata only — codes, names, classes and groups. Monetary openings use Opening balances. This does not post
          journals. Columns: <code>code,name,type,subtype,parent_code,description,is_group</code>
        </p>
        <div className="import-editor">
          <TextAreaField
            id="coa-csv"
            label="CSV"
            rows={12}
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {summary || issues.length > 0 ? (
          <div className="import-review" role="region" aria-label="Import review">
            {summary ? (
              <p className={issues.length > 0 ? 'field-help' : 'form-success'} role="status">
                {summary}
              </p>
            ) : null}
            {issues.length > 0 ? (
              <ul className="import-issue-list">
                {issues.map((issue, index) => (
                  <li key={`${issue.field ?? 'row'}-${index}`}>
                    {issue.line ? `Line ${issue.line}` : ''}
                    {issue.field ? `${issue.line ? ' · ' : ''}${issue.field}: ` : issue.line ? ': ' : ''}
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </form>
    </FormShell>
  );
}
