'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { listPlatformUsers, type PlatformUserRow } from '@/app/actions/platform';
import { StatusBadge } from '@/components/module/list-page';
import { Card } from '@/components/ui/bookone-ui';

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
    <div className="workspace party-workspace">
      <div className="party-toolbar">
        <div className="party-search-form" style={{ flex: 1 }}>
          <input
            className="input party-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users or company…"
            aria-label="Search users"
            autoComplete="off"
          />
        </div>
        {pending ? (
          <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Searching…</span>
        ) : null}
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Home company</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--ink-muted)' }}>
                      No users found
                    </td>
                  </tr>
                ) : (
                  rows.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 700 }}>{u.name}</td>
                      <td>{u.email}</td>
                      <td>
                        {u.role === 'super_admin' ? (
                          <StatusBadge status="posted" />
                        ) : (
                          <StatusBadge status="active" />
                        )}{' '}
                        <span style={{ fontSize: 12, textTransform: 'capitalize' }}>{u.role}</span>
                      </td>
                      <td>
                        <div>{u.tenantName}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{u.tenantSlug}</div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
