'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/bookone-ui';
import { pushStatusToast } from '@/components/layout/status-toast';
import type { PreparedArchiveMeta } from '@/lib/tenant-archive-types';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupClient({ initialMeta }: { initialMeta: PreparedArchiveMeta | null }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<PreparedArchiveMeta | null>(initialMeta);

  async function prepare(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/company/backup/prepare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password, confirm }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; meta?: PreparedArchiveMeta };
      if (!res.ok || !json.ok || !json.meta) {
        pushStatusToast({ kind: 'error', message: json.error ?? 'Could not create the backup.' });
        return;
      }
      setMeta(json.meta);
      setPassword('');
      setConfirm('');
      pushStatusToast({
        kind: 'success',
        message: 'Backup ready. Download both files and keep the password.',
      });
    } catch {
      pushStatusToast({ kind: 'error', message: 'Could not create the backup.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-grid">
      <form onSubmit={prepare} className="form-grid">
        <div className="field">
          <label htmlFor="archive-password">Password</label>
          <input
            id="archive-password"
            name="password"
            type="password"
            className="input"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="archive-confirm">Confirm password</label>
          <input
            id="archive-confirm"
            name="confirm"
            type="password"
            className="input"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div className="field field-full">
          <Button variant="primary" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? 'Preparing…' : 'Create backup'}
          </Button>
        </div>
      </form>

      {meta ? (
        <div className="field field-full" style={{ display: 'grid', gap: 12 }}>
          <p style={{ color: 'var(--ink-muted)', fontSize: 13, margin: 0 }}>
            Pair {meta.exportId.slice(0, 8)} · data {formatBytes(meta.dataBytes)} · attachments{' '}
            {formatBytes(meta.filesBytes)} ({meta.fileCount} file{meta.fileCount === 1 ? '' : 's'}
            {meta.missingCount ? `, ${meta.missingCount} missing` : ''}). Download both. The password is not stored here.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <a className="btn-secondary" href="/api/company/backup/download?kind=data" download={meta.dataFileName}>
              Download company data
            </a>
            <a className="btn-secondary" href="/api/company/backup/download?kind=files" download={meta.filesFileName}>
              Download attachments
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RestoreClient({ restoreEnabled }: { restoreEnabled: boolean }) {
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);

  async function restore(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (restoreBusy || !restoreEnabled) return;
    const form = e.currentTarget;
    const input = form.elements.namedItem('file') as HTMLInputElement | null;
    const chosen = input?.files?.[0];
    if (!chosen) {
      pushStatusToast({ kind: 'error', message: 'Choose a company data file to restore.' });
      return;
    }
    setRestoreBusy(true);
    try {
      const body = new FormData();
      body.set('file', chosen);
      body.set('password', restorePassword);
      const res = await fetch('/api/company/backup/restore', {
        method: 'POST',
        credentials: 'same-origin',
        body,
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; exportId?: string };
      if (!res.ok || !json.ok) {
        pushStatusToast({ kind: 'error', message: json.error ?? 'Could not restore this backup.' });
        return;
      }
      setRestorePassword('');
      form.reset();
      pushStatusToast({
        kind: 'success',
        message: 'Company data restored. Upload the matching attachments pack later if you have it.',
      });
      window.location.reload();
    } catch {
      pushStatusToast({ kind: 'error', message: 'Could not restore this backup.' });
    } finally {
      setRestoreBusy(false);
    }
  }

  if (!restoreEnabled) {
    return (
      <button type="button" className="btn-secondary" disabled>
        Restore (company already has records)
      </button>
    );
  }

  return (
    <form onSubmit={restore} className="form-grid">
      <div className="field">
        <label htmlFor="archive-restore-file">Data file</label>
        <input
          id="archive-restore-file"
          name="file"
          type="file"
          className="input"
          accept=".bookone-data,application/octet-stream"
          required
          disabled={restoreBusy}
        />
      </div>
      <div className="field">
        <label htmlFor="archive-restore-password">Archive password</label>
        <input
          id="archive-restore-password"
          name="restorePassword"
          type="password"
          className="input"
          autoComplete="current-password"
          value={restorePassword}
          onChange={(e) => setRestorePassword(e.target.value)}
          minLength={8}
          required
          disabled={restoreBusy}
        />
      </div>
      <div className="field field-full">
        <Button
          variant="secondary"
          type="submit"
          disabled={restoreBusy}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {restoreBusy ? 'Restoring…' : 'Restore company data'}
        </Button>
      </div>
    </form>
  );
}
