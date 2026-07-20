'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { PlatformCompanyRow } from '@/app/actions/platform';
import { StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

const PAGE_SIZE = 10;

export function CompaniesListScreen({ rows: initialRows }: { rows: PlatformCompanyRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all');
  const [plan, setPlan] = useState(searchParams.get('plan') ?? 'all');
  const [environment, setEnvironment] = useState(searchParams.get('environment') ?? 'all');
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
  }, [query, status, plan, environment, pathname, router, searchParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (plan !== 'all' && r.plan !== plan) return false;
      if (environment !== 'all' && r.environment !== environment) return false;
      if (!q) return true;
      return `${r.name} ${r.slug}`.toLowerCase().includes(q);
    });
  }, [rows, query, status, plan, environment]);

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
    <div className="workspace party-workspace">
      <div className="party-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="party-search-form" style={{ flex: '1 1 200px' }}>
          <input
            className="input party-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies…"
            aria-label="Search companies"
            autoComplete="off"
          />
        </div>
        <select
          className="input"
          style={{ width: 'auto', minWidth: 120 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status"
        >
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <select
          className="input"
          style={{ width: 'auto', minWidth: 120 }}
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          aria-label="Plan"
        >
          <option value="all">All plans</option>
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="pro">Pro</option>
        </select>
        <select
          className="input"
          style={{ width: 'auto', minWidth: 130 }}
          value={environment}
          onChange={(e) => setEnvironment(e.target.value)}
          aria-label="Environment"
        >
          <option value="all">All envs</option>
          <option value="production">Production</option>
          <option value="staging">Staging</option>
        </select>
        <Link href="/control-room/companies/new">
          <Button variant="primary" type="button">
            New company
          </Button>
        </Link>
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {pageRows.length === 0 ? (
            <div className="empty-state" style={{ padding: 28 }}>
              <h3>No companies found</h3>
              <p>{query ? 'Try a different search.' : 'Use New company to onboard the first tenant.'}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Plan</th>
                    <th>Env</th>
                    <th>Status</th>
                    <th>Users</th>
                    <th>Created</th>
                    <th style={{ width: 72 }} />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div style={{ fontWeight: 750 }}>{row.name}</div>
                        <div style={{ color: 'var(--ink-soft)', fontSize: 12 }}>{row.slug}</div>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{row.plan}</td>
                      <td>
                        <StatusBadge status={row.environment === 'staging' ? 'draft' : 'posted'} />
                        <span style={{ marginLeft: 6, fontSize: 12, textTransform: 'capitalize' }}>
                          {row.environment}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={row.status === 'active' ? 'active' : 'inactive'} />
                      </td>
                      <td>{row.userCount}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        {new Date(row.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <Link href={`/control-room/companies/${row.id}`}>
                          <Button variant="ghost" type="button">
                            Open
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > PAGE_SIZE ? (
            <div
              className="cluster"
              style={{ justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--line)' }}
            >
              <span style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
                {filtered.length} companies · page {safePage}/{totalPages}
              </span>
              <div className="cluster" style={{ gap: 8 }}>
                <Button variant="secondary" type="button" disabled={safePage <= 1} onClick={() => goPage(safePage - 1)}>
                  Prev
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => goPage(safePage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
