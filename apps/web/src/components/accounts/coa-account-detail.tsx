'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { FormFooter, FormShell } from '@/components/ui/form-shell';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { withFormPending } from '@/components/ui/form-busy';
import { updateCompanyAccount } from '@/app/actions/chart-of-accounts';
import { classLabel, controlLabel, liquidityLabel, sideLabel, statusLabel, subtypeLabel } from '@/lib/coa-labels';
import type { CoaRow } from '@/components/accounts/coa-manager';

type Account = CoaRow & {
  description?: string | null;
  institution?: string | null;
  lastDigits?: string | null;
};

export function CoaAccountDetail({
  account,
  accounts,
  currency,
  money,
  canWrite,
}: {
  account: Account;
  accounts: Account[];
  currency: string;
  money: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(account.name);
  const [description, setDescription] = useState(account.description ?? '');
  const [parentCode, setParentCode] = useState(account.parentCode ?? '');
  const [institution, setInstitution] = useState(account.institution ?? '');
  const [lastDigits, setLastDigits] = useState(account.lastDigits ?? '');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const parentOptions = useMemo(
    () =>
      accounts
        .filter((row) => row.id !== account.id && row.type === account.type)
        .map((row) => ({ value: row.code, label: `${row.code} · ${row.name}` })),
    [accounts, account.id, account.type],
  );

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(() => {
      void withFormPending(async () => {
        const result = await updateCompanyAccount({
          id: account.id,
          expectedVersion: account.version ?? 1,
          name,
          description,
          parentCode: parentCode || null,
          institution: account.subtype === 'bank' ? institution : undefined,
          lastDigits: account.subtype === 'bank' ? lastDigits : undefined,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage('Account details saved. Posted journals keep their original lines.');
        router.refresh();
      });
    });
  }

  return (
    <FormShell
      backHref="/accounts"
      backParent="Accounts"
      title={account.code}
      footer={
        <FormFooter>
          <Button type="button" onClick={() => router.push('/accounts')}>
            Back
          </Button>
          <a className="button" href={`/journal?account=${account.code}`}>
            Open ledger
          </a>
          {canWrite ? (
            <Button variant="primary" type="submit" form="coa-edit" disabled={pending}>
              Save name
            </Button>
          ) : null}
        </FormFooter>
      }
    >
      <div className="coa-detail-header">
        <div>
          <h1 className="card-title">{account.name}</h1>
          <p className="card-subtitle">
            Balance {money}. Creating an account starts at zero; opening balances are a separate posting.
          </p>
        </div>
        <Badge tone={account.isActive === '0' ? 'warning' : 'success'}>{statusLabel(account.isActive)}</Badge>
      </div>
      <dl className="coa-meta-grid">
        <div>
          <dt>Class</dt>
          <dd>{classLabel(account.type)}</dd>
        </div>
        <div>
          <dt>Subtype</dt>
          <dd>{subtypeLabel(account.subtype)}</dd>
        </div>
        <div>
          <dt>Normal side</dt>
          <dd>{sideLabel(account.normalSide)}</dd>
        </div>
        <div>
          <dt>Liquidity</dt>
          <dd>{liquidityLabel(account.liquidity)}</dd>
        </div>
        <div>
          <dt>Control role</dt>
          <dd>{controlLabel(account.controlRole)}</dd>
        </div>
        <div>
          <dt>Posting</dt>
          <dd>
            {account.isGroup === '1' ? 'Group heading (no postings)' : 'Posting account'}
            {account.isSystem === '1' ? ' · system control' : ''}
          </dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>{currency}</dd>
        </div>
      </dl>
      {canWrite ? (
        <form id="coa-edit" onSubmit={save} className="party-tab-grid" style={{ marginTop: 16 }}>
          {error ? (
            <p className="form-error field-full" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="form-success field-full" role="status">
              {message}
            </p>
          ) : null}
          <TextField id="coa-edit-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} required className="field-full" />
          <TextField
            id="coa-edit-desc"
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="field-full"
          />
          <SelectField
            id="coa-edit-parent"
            label="Parent"
            className="field-full"
            value={parentCode}
            onChange={setParentCode}
            options={[{ value: '', label: 'No parent' }, ...parentOptions]}
          />
          {account.subtype === 'bank' ? (
            <>
              <TextField id="coa-edit-bank" label="Institution" value={institution} onChange={(e) => setInstitution(e.target.value)} />
              <TextField
                id="coa-edit-digits"
                label="Last digits"
                value={lastDigits}
                onChange={(e) => setLastDigits(e.target.value.replace(/\D/g, '').slice(-4))}
                inputMode="numeric"
                autoComplete="off"
              />
            </>
          ) : null}
        </form>
      ) : (
        <p className="field-help">You can view this account. Renaming needs Accounts write.</p>
      )}
    </FormShell>
  );
}
