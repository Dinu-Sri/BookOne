'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ACCOUNT_WIZARD_TEMPLATES, type WizardTemplateId } from '@bookone/accounting';
import { Button } from '@/components/ui/bookone-ui';
import { FormFooter, FormShell } from '@/components/ui/form-shell';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { withFormPending } from '@/components/ui/form-busy';
import { createCompanyAccount, suggestAccountCode } from '@/app/actions/chart-of-accounts';
import { ROOT_CLASS_OPTIONS, classLabel } from '@/lib/coa-labels';

export function CoaWizard({
  defaultTemplate = 'bank',
  accounts,
}: {
  defaultTemplate?: WizardTemplateId;
  accounts: Array<{ code: string; name: string; type: string; isGroup?: string | null }>;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<WizardTemplateId>(
    ACCOUNT_WIZARD_TEMPLATES.some((row) => row.id === defaultTemplate) ? defaultTemplate : 'bank',
  );
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentCode, setParentCode] = useState('');
  const [groupType, setGroupType] = useState('asset');
  const [institution, setInstitution] = useState('');
  const [lastDigits, setLastDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const template = useMemo(
    () => ACCOUNT_WIZARD_TEMPLATES.find((row) => row.id === templateId) ?? ACCOUNT_WIZARD_TEMPLATES[0]!,
    [templateId],
  );
  const statementType = templateId === 'group' ? groupType : template.type;
  const parentOptions = useMemo(
    () =>
      accounts
        .filter((row) => row.type === statementType && row.code !== code)
        .map((row) => ({
          value: row.code,
          label: `${row.code} · ${row.name}`,
          description: row.isGroup === '1' ? 'Group heading' : classLabel(row.type),
        })),
    [accounts, statementType, code],
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
          parentCode: parentCode || undefined,
          type: templateId === 'group' ? groupType : undefined,
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
    <FormShell
      backHref="/accounts"
      backParent="Accounts"
      title="New account"
      footer={
        <FormFooter>
          <Button type="button" onClick={() => router.push('/accounts')}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="coa-create" disabled={pending}>
            Create account
          </Button>
        </FormFooter>
      }
    >
      <form id="coa-create" onSubmit={onSubmit} className="coa-form">
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <section className="coa-section">
          <h2>Account type</h2>
          <SelectField
            id="coa-template"
            label="What are you adding?"
            value={templateId}
            onChange={(next) => {
              setTemplateId(next as WizardTemplateId);
              setCode('');
              setParentCode('');
            }}
            options={ACCOUNT_WIZARD_TEMPLATES.map((row) => ({ value: row.id, label: row.label, description: row.help }))}
            help={`Shows on ${template.statement}. Normal side is set from the class.`}
          />
          {templateId === 'group' ? (
            <SelectField
              id="coa-group-type"
              label="Statement class"
              value={groupType}
              onChange={setGroupType}
              options={ROOT_CLASS_OPTIONS}
              help="Group headings do not accept journals. Children must share this class."
            />
          ) : null}
        </section>
        <section className="coa-section">
          <h2>Account identity</h2>
          <div className="coa-code-row">
            <TextField id="coa-code" label="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
            <Button type="button" id="coa-suggest" onClick={suggest} disabled={pending}>
              Suggest code
            </Button>
          </div>
          <TextField id="coa-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextField id="coa-desc" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </section>
        <section className="coa-section">
          <h2>Hierarchy</h2>
          <SelectField
            id="coa-parent"
            label="Parent (optional)"
            value={parentCode}
            onChange={setParentCode}
            placeholder="No parent"
            options={[{ value: '', label: 'No parent' }, ...parentOptions]}
            emptyReason="No other accounts in this class yet."
            help="Parent must be the same statement class. Leave empty for a root account."
          />
        </section>
        {templateId === 'bank' ? (
          <section className="coa-section">
            <h2>Bank details</h2>
            <div className="coa-bank-row">
              <TextField
                id="coa-bank"
                label="Institution"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                help="Display only. This does not open a real bank account or store a login."
              />
              <TextField
                id="coa-digits"
                label="Last digits"
                value={lastDigits}
                onChange={(e) => setLastDigits(e.target.value.replace(/\D/g, '').slice(-4))}
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
          </section>
        ) : null}
      </form>
    </FormShell>
  );
}
