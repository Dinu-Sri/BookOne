'use client';

import { useState } from 'react';
import { unlockOpsLogs } from './actions';

export function OpsLogGate() {
  const [error, setError] = useState('');
  return (
    <form
      className="ops-log-gate"
      action={async (fd) => {
        const res = await unlockOpsLogs(fd);
        if (!res.ok) setError(res.error);
        else window.location.reload();
      }}
    >
      <h1>Ops log</h1>
      <p>Password required. No user session.</p>
      <input className="input" type="password" name="password" autoFocus autoComplete="current-password" />
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button primary" type="submit">
        Open logs
      </button>
    </form>
  );
}

export function OpsLogTable({
  rows,
  error,
}: {
  rows: {
    id: string;
    createdAt: Date;
    kind: string;
    path: string | null;
    durationMs: number | null;
    status: string | null;
    message: string | null;
  }[];
  error: string;
}) {
  return (
    <>
      <header className="ops-log-head">
        <h1>Ops log</h1>
        <p>
          Slow (&gt;2s) and failed server actions. Newest first. Public URL, password only — no ERP login.
        </p>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      <table className="ops-log-table">
        <thead>
          <tr>
            <th>When (UTC)</th>
            <th>Kind</th>
            <th>Ms</th>
            <th>Status</th>
            <th>Path</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6}>No rows yet. Slow posts and errors appear after migration 039.</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toISOString().replace('T', ' ').slice(0, 19)}</td>
                <td>{r.kind}</td>
                <td>{r.durationMs ?? '—'}</td>
                <td>{r.status ?? '—'}</td>
                <td>{r.path ?? '—'}</td>
                <td>{r.message ?? '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
