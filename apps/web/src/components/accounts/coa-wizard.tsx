'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ACCOUNT_WIZARD_TEMPLATES, type WizardTemplateId } from '@bookone/accounting';
import { Button, Card } from '@/components/ui/bookone-ui';
import { withFormPending } from '@/components/ui/form-busy';
import { createCompanyAccount, suggestAccountCode } from '@/app/actions/chart-of-accounts';

export function CoaWizard({ defaultTemplate = 'bank' }: { defaultTemplate?: WizardTemplateId }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<WizardTemplateId>(defaultTemplate);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [institution, setInstitution] = useState('');
  const [lastDigits, setLastDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const template = useMemo(
    () => ACCOUNT_WIZARD_TEMPLATES.find((row) => row.id === templateId) ?? ACCOUNT_WIZARD_TEMPLATES[0]!,
    [templateId],
  );

  function suggest() {
    start(() => {
      void (async () => {
        const result = await suggestAccountCode(templateId);
        if (result.ok) setCode(result.data.code);
        else setError(result.error);
      })();
    });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await suggestAccountCode(templateId);
      if (cancelled) return;
      if (result.ok) setCode(result.data.code);
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(() => {
      void withFormPending(async () => {
        const result = await createCompanyAccount({
          templateId,
          code,
          name,
          description,
          institution: templateId === 'bank' ? institution : undefined,
          lastDigits: templateId === 'bank' ? lastDigits : undefined,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/accounts/${result.data.id}`);
        router.refresh();
      });
    });
  }

  return (
    <Card>
      <div className="card-header">
        <div>
          <p className="eyebrow">New account</p>
          <h1 className="card-title" style={{ marginTop: 4 }}>
            {template.label}
          </h1>
          <p className="card-subtitle">{template.help}</p>
        </div>
      </div>
      <div className="card-body">
        <form onSubmit={onSubmit} className="form-grid">
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="field field-full">
            <label htmlFor="coa-template">What are you adding?</label>
            <select
              id="coa-template"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value as WizardTemplateId);
                setCode('');
              }}
            >
              {ACCOUNT_WIZARD_TEMPLATES.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
            <p className="field-help">Shows on {template.statement}. Normal side is set from the class.</p>
          </div>
          <div className="field">
            <label htmlFor="coa-code">Code</label>
            <input id="coa-code" value={code} onChange={(e) => setCode(e.target.value)} required />
            <Button type="button" onClick={suggest} disabled={pending}>
              Suggest code
            </Button>
          </div>
          <div className="field">
            <label htmlFor="coa-name">Name</label>
            <input id="coa-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field field-full">
            <label htmlFor="coa-desc">Description</label>
            <input id="coa-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {templateId === 'bank' ? (
            <>
              <div className="field">
                <label htmlFor="coa-bank">Institution (optional)</label>
                <input id="coa-bank" value={institution} onChange={(e) => setInstitution(e.target.value)} />
                <p className="field-help">Display only. This does not open a real bank account or store a login.</p>
              </div>
              <div className="field">
                <label htmlFor="coa-digits">Last digits (optional)</label>
                <input
                  id="coa-digits"
                  value={lastDigits}
                  onChange={(e) => setLastDigits(e.target.value.replace(/\D/g, '').slice(-4))}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
            </>
          ) : null}
          <div className="cluster" style={{ gap: 8 }}>
            <Button variant="primary" type="submit" disabled={pending}>
              Create account
            </Button>
            <Button type="button" onClick={() => router.push('/accounts')}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
