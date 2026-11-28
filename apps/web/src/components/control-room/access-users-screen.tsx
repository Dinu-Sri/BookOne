'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { listPlatformUsers, type PlatformUserRow } from '@/app/actions/platform';
import { Badge } from '@/components/ui/bookone-ui';
import { SearchField } from '@/components/ui/text-field';
import { entityKindLabel } from '@/lib/entity-labels';

export function AccessUsersScreen({ initialRows }: { initialRows: PlatformUserRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();

  useEffect(() => setRows(initialRows), [initialRows]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      startTransition(async () => {
        try {
          const next = await listPlatformUsers(query || undefined);
          setRows(next);
        } catch {
          router.replace('/login');
        }
      });
    }, 280);
    return () => window.clearTimeout(handle);
  }, [query, router]);

  return (
    <div className="workspace ux-page">
      <header className="ux-head">
        <div className="ux-head-text">
          <div>
            <h1 className="page-title">Access</h1>
            <p>Everyone who can sign in to this BookOne server, their role, and the company they open first.</p>
          </div>
        </div>
      </header>

      <div className="cr-filters is-single">
        <SearchField
          id="access-search"
          label="Search people"
          value={query}
          onChange={setQuery}
          placeholder="Search by name, email or company"
        />
        {pending ? <span className="cr-when">Searching…</span> : null}
      </div>

      <section className="ux-card" aria-label="People">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Email</th>
                <th>Role</th>
                <th>Home company</th>
                <th>Type</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--ink-muted)' }}>
                    No one matches that search.
                  </td>
                </tr>
              ) : (
                rows.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 650 }}>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      {u.role === 'super_admin' ? (
                        <Badge tone="info">Platform admin</Badge>
                      ) : (
                        <span>{u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1).replace(/_/g, ' ') : '—'}</span>
                      )}
                    </td>
                    <td>
                      {u.tenantName}
                      {u.tenantStatus === 'archived' ? <span className="coa-tag">Archived</span> : null}
                    </td>
                    <td>{entityKindLabel(u.entityKind, u.capabilityTier)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(u.createdAt).toLocaleDateString('en-CA')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
