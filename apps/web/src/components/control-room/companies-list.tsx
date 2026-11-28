'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { PlatformCompanyRow } from '@/app/actions/platform';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { SelectField } from '@/components/ui/select-field';
import { SearchField } from '@/components/ui/text-field';
import { companyStatusWord, environmentWord, planWord } from '@/lib/platform-labels';
import { entityKindLabel } from '@/lib/entity-labels';

const PAGE_SIZE = 10;

export function CompaniesListScreen({ rows: initialRows }: { rows: PlatformCompanyRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all');
  const [plan, setPlan] = useState(searchParams.get('plan') ?? 'all');
  const [environment, setEnvironment] = useState(searchParams.get('environment') ?? 'all');
  const [entityKind, setEntityKind] = useState(searchParams.get('entityKind') ?? 'all');
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get('page') ?? '1') || 1));
  const [rows, setRows] = useState(initialRows);
  const [, startTransition] = useTransition();

  useEffect(() => setRows(initialRows), [initialRows]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const sync = (key: string, val: string, all = 'all') => {
        if (!val || val === all) params.delete(key);
        else params.set(key, val);
      };
      sync('q', query, '');
      sync('status', status);
      sync('plan', plan);
      sync('environment', environment);
      sync('entityKind', entityKind);
      params.delete('page');
      const next = params.toString();
      const cur = searchParams.toString();
      if (next === cur) return;
      startTransition(() => {
        router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
      });
      setPage(1);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, status, plan, environment, entityKind, pathname, router, searchParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (plan !== 'all' && r.plan !== plan) return false;
      if (environment !== 'all' && r.environment !== environment) return false;
      if (entityKind !== 'all' && r.entityKind !== entityKind) return false;
      if (!q) return true;
      return `${r.name} ${r.slug} ${r.entityKind}`.toLowerCase().includes(q);
    });
  }, [rows, query, status, plan, environment, entityKind]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function goPage(next: number) {
    const p = Math.min(totalPages, Math.max(1, next));
    setPage(p);
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete('page');
    else params.set('page', String(p));
    const s = params.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  return (
    <div className="workspace ux-page">
      <header className="ux-head">
        <div className="ux-head-text">
          <div>
            <h1 className="page-title">Companies</h1>
            <p>Find a company, then open it to change its details, plan or status.</p>
          </div>
        </div>
        <div className="ux-head-actions">
          <Link href="/control-room/companies/new" className="button primary">
            New company
          </Link>
        </div>
      </header>

      <div className="cr-filters">
        <SearchField
          id="cr-search"
          label="Search companies"
          value={query}
          onChange={setQuery}
          placeholder="Search by name"
          className="cr-search"
        />
        <SelectField
          id="cr-status"
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Any status' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
        <SelectField
          id="cr-type"
          label="Type"
          value={entityKind}
          onChange={setEntityKind}
          options={[
            { value: 'all', label: 'Any type' },
            { value: 'personal', label: 'Personal' },
            { value: 'sole_prop', label: 'Sole proprietor' },
            { value: 'company', label: 'Company' },
            { value: 'pending', label: 'Not chosen yet' },
          ]}
        />
        <SelectField
          id="cr-plan"
          label="Plan"
          value={plan}
          onChange={setPlan}
          options={[
            { value: 'all', label: 'Any plan' },
            { value: 'starter', label: 'Starter' },
            { value: 'growth', label: 'Growth' },
            { value: 'pro', label: 'Pro' },
          ]}
        />
        <SelectField
          id="cr-env"
          label="Server"
          value={environment}
          onChange={setEnvironment}
          options={[
            { value: 'all', label: 'Live and test' },
            { value: 'production', label: 'Live' },
            { value: 'staging', label: 'Test (staging)' },
          ]}
        />
      </div>

      <section className="ux-card" aria-label="Companies">
        {pageRows.length === 0 ? (
          <div className="ux-empty cr-empty">
            <h2>No companies found</h2>
            <p>{query ? 'Try a different name, or clear the filters.' : 'Use New company to set up the first one.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Type</th>
                  <th>Plan</th>
                  <th>Server</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>People</th>
                  <th>Created</th>
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const st = companyStatusWord(row.status);
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/control-room/companies/${row.id}`} className="cr-name">
                          {row.name}
                        </Link>
                      </td>
                      <td>{entityKindLabel(row.entityKind, row.capabilityTier)}</td>
                      <td>{planWord(row.plan)}</td>
                      <td>{environmentWord(row.environment)}</td>
                      <td>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>{row.userCount}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(row.createdAt).toLocaleDateString('en-CA')}</td>
                      <td>
                        <Link href={`/control-room/companies/${row.id}`} className="cr-link">
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > PAGE_SIZE ? (
          <div className="cr-pager">
            <span>
              {filtered.length} companies · page {safePage} of {totalPages}
            </span>
            <div className="cluster" style={{ gap: 8 }}>
              <Button variant="secondary" type="button" disabled={safePage <= 1} onClick={() => goPage(safePage - 1)}>
                Previous
              </Button>
              <Button variant="secondary" type="button" disabled={safePage >= totalPages} onClick={() => goPage(safePage + 1)}>
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
