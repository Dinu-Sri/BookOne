'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card } from '@/components/ui/bookone-ui';
import { withFormPending } from '@/components/ui/form-busy';
import { archiveCompanyAccount, exportChartCsv, reactivateCompanyAccount } from '@/app/actions/chart-of-accounts';

export type CoaRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  normalSide: string;
  balance: number;
  subtype?: string | null;
  isGroup?: string | null;
  isSystem?: string | null;
  isActive?: string | null;
  liquidity?: string | null;
  parentCode?: string | null;
  version?: number;
};

const ROOTS = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

function money(value: number, currency: string) {
  const sign = value < 0 ? '-' : '';
  return `${sign}${currency} ${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function typeTone(type: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (type) {
    case 'asset':
      return 'info';
    case 'liability':
      return 'warning';
    case 'equity':
      return 'neutral';
    case 'revenue':
      return 'success';
    case 'expense':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function CoaManager({
  accounts,
  currency,
  canWrite,
  focus,
}: {
  accounts: CoaRow[];
  currency: string;
  canWrite: boolean;
  focus?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(focus === 'bank' ? 'bank' : '');
  const [root, setRoot] = useState<string>('all');
  const [status, setStatus] = useState<'active' | 'archived' | 'all'>(focus === 'archived' ? 'archived' : 'active');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((row) => {
      const archived = row.isActive === '0';
      if (status === 'active' && archived) return false;
      if (status === 'archived' && !archived) return false;
      if (root !== 'all' && row.type !== root) return false;
      if (!q) return true;
      return (
        row.code.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        (row.subtype ?? '').toLowerCase().includes(q) ||
        (row.liquidity ?? '').toLowerCase().includes(q)
      );
    });
  }, [accounts, query, root, status]);

  function archive(row: CoaRow) {
    setError(null);
    setMessage(null);
    start(() => {
      void withFormPending(async () => {
        const result = await archiveCompanyAccount(row.id, row.version ?? 1);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(`Archived ${row.code}.`);
        router.refresh();
      });
    });
  }

  function reactivate(row: CoaRow) {
    setError(null);
    setMessage(null);
    start(() => {
      void withFormPending(async () => {
        const result = await reactivateCompanyAccount(row.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(`Reactivated ${row.code}.`);
        router.refresh();
      });
    });
  }

  function exportCsv() {
    setError(null);
    start(() => {
      void withFormPending(async () => {
        const result = await exportChartCsv();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chart-of-accounts.csv';
        a.click();
        URL.revokeObjectURL(url);
        setMessage('Chart exported.');
      });
    });
  }

  return (
    <div className="workspace">
      <Card>
        <div className="card-header">
          <div>
            <p className="eyebrow">Accounting</p>
            <h1 className="card-title" style={{ marginTop: 4 }}>
              Chart of Accounts
            </h1>
            <p className="card-subtitle">
              Company accounts, banks, advances and opening balances. Reports use the current name; posted journals keep their original lines.
            </p>
          </div>
          <div className="cluster" style={{ gap: 8, flexWrap: 'wrap' }}>
            {canWrite ? (
              <Link href="/accounts/new" className="button primary">
                New account
              </Link>
            ) : null}
            {canWrite ? (
              <Link href="/accounts/opening" className="button">
                Opening balances
              </Link>
            ) : null}
            {canWrite ? (
              <Link href="/accounts/import" className="button">
                Import CSV
              </Link>
            ) : null}
            <Button onClick={exportCsv} disabled={pending}>
              Export CSV
            </Button>
            <Link href="/advances" className="button">
              Advances
            </Link>
          </div>
        </div>
        <div className="card-body">
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
          <div className="cluster" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div className="field">
              <label htmlFor="coa-search">Search</label>
              <input
                id="coa-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Code, name or bank"
              />
            </div>
            <div className="field">
              <label htmlFor="coa-root">Class</label>
              <select id="coa-root" value={root} onChange={(e) => setRoot(e.target.value)}>
                <option value="all">All classes</option>
                {ROOTS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="coa-status">Status</label>
              <select id="coa-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
          {filtered.length === 0 ? (
            <p>No accounts match these filters.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Class</th>
                    <th>Subtype</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{row.code}</td>
                      <td>
                        <Link href={`/accounts/${row.id}`}>{row.name}</Link>
                        {row.isGroup === '1' ? ' · group' : ''}
                        {row.isSystem === '1' ? ' · system' : ''}
                      </td>
                      <td>
                        <Badge tone={typeTone(row.type)}>{row.type}</Badge>
                      </td>
                      <td>{row.subtype || '—'}</td>
                      <td>{row.isActive === '0' ? 'Archived' : 'Active'}</td>
                      <td style={{ textAlign: 'right' }} className={row.balance < 0 ? 'amount-negative' : 'amount-positive'}>
                        {money(row.balance, currency)}
                      </td>
                      <td>
                        <div className="cluster" style={{ gap: 8 }}>
                          <Link href={`/journal?account=${row.code}`}>Ledger</Link>
                          {canWrite && row.isActive !== '0' ? (
                            <Button onClick={() => archive(row)} disabled={pending}>
                              Archive
                            </Button>
                          ) : null}
                          {canWrite && row.isActive === '0' ? (
                            <Button onClick={() => reactivate(row)} disabled={pending}>
                              Reactivate
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
