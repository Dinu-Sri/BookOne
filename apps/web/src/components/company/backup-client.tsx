'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/bookone-ui';
import { emitFormPending } from '@/components/ui/form-busy';
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
    emitFormPending(true);
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
      emitFormPending(false);
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

const FILE_CHUNK_BYTES = 4 * 1024 * 1024;
const SINGLE_SHOT_BYTES = 8 * 1024 * 1024;

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
    emitFormPending(true);
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
      emitFormPending(false);
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

export function FilesRestoreClient({
  enabled,
  disabledReason,
}: {
  enabled: boolean;
  disabledReason: string;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  async function restore(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !enabled) return;
    const form = e.currentTarget;
    const input = form.elements.namedItem('filesPack') as HTMLInputElement | null;
    const chosen = input?.files?.[0];
    if (!chosen) {
      pushStatusToast({ kind: 'error', message: 'Choose an attachments pack to restore.' });
      return;
    }
    setBusy(true);
    setProgress('Uploading…');
    emitFormPending(true);
    try {
      let json: {
        ok?: boolean;
        error?: string;
        applied?: number;
        skippedExisting?: number;
      };
      if (chosen.size <= SINGLE_SHOT_BYTES) {
        const body = new FormData();
        body.set('file', chosen);
        body.set('password', password);
        const res = await fetch('/api/company/backup/restore-files', {
          method: 'POST',
          credentials: 'same-origin',
          body,
        });
        json = (await res.json()) as typeof json;
        if (!res.ok || !json.ok) {
          pushStatusToast({ kind: 'error', message: json.error ?? 'Could not restore this backup.' });
          return;
        }
      } else {
        const chunkCount = Math.ceil(chosen.size / FILE_CHUNK_BYTES);
        const initBody = new FormData();
        initBody.set('action', 'init');
        initBody.set('totalBytes', String(chosen.size));
        initBody.set('chunkCount', String(chunkCount));
        const initRes = await fetch('/api/company/backup/restore-files', {
          method: 'POST',
          credentials: 'same-origin',
          body: initBody,
        });
        const initJson = (await initRes.json()) as { ok?: boolean; error?: string; sessionId?: string };
        if (!initRes.ok || !initJson.ok || !initJson.sessionId) {
          pushStatusToast({ kind: 'error', message: initJson.error ?? 'Could not restore this backup.' });
          return;
        }
        for (let i = 0; i < chunkCount; i++) {
          setProgress(`Uploading… ${i + 1}/${chunkCount}`);
          const part = chosen.slice(i * FILE_CHUNK_BYTES, Math.min(chosen.size, (i + 1) * FILE_CHUNK_BYTES));
          const chunkBody = new FormData();
          chunkBody.set('action', 'chunk');
          chunkBody.set('sessionId', initJson.sessionId);
          chunkBody.set('index', String(i));
          chunkBody.set('chunk', part, `part-${i}`);
          const chunkRes = await fetch('/api/company/backup/restore-files', {
            method: 'POST',
            credentials: 'same-origin',
            body: chunkBody,
          });
          const chunkJson = (await chunkRes.json()) as { ok?: boolean; error?: string };
          if (!chunkRes.ok || !chunkJson.ok) {
            pushStatusToast({
              kind: 'error',
              message: chunkJson.error ?? 'Could not restore this backup.',
            });
            return;
          }
        }
        setProgress('Applying attachments…');
        const commitBody = new FormData();
        commitBody.set('action', 'commit');
        commitBody.set('sessionId', initJson.sessionId);
        commitBody.set('password', password);
        const commitRes = await fetch('/api/company/backup/restore-files', {
          method: 'POST',
          credentials: 'same-origin',
          body: commitBody,
        });
        json = (await commitRes.json()) as typeof json;
        if (!commitRes.ok || !json.ok) {
          pushStatusToast({ kind: 'error', message: json.error ?? 'Could not restore this backup.' });
          return;
        }
      }
      setPassword('');
      form.reset();
      const applied = json.applied ?? 0;
      const skipped = json.skippedExisting ?? 0;
      pushStatusToast({
        kind: 'success',
        message: `Attachments restored (${applied} copied${skipped ? `, ${skipped} already present` : ''}).`,
      });
      window.location.reload();
    } catch {
      pushStatusToast({ kind: 'error', message: 'Could not restore this backup.' });
    } finally {
      emitFormPending(false);
      setBusy(false);
      setProgress('');
    }
  }

  if (!enabled) {
    return (
      <button type="button" className="btn-secondary" disabled>
        {disabledReason}
      </button>
    );
  }

  return (
    <form onSubmit={restore} className="form-grid">
      <div className="field">
        <label htmlFor="archive-files-pack">Attachments pack</label>
        <input
          id="archive-files-pack"
          name="filesPack"
          type="file"
          className="input"
          accept=".bookone-files,application/octet-stream"
          required
          disabled={busy}
        />
      </div>
      <div className="field">
        <label htmlFor="archive-files-password">Archive password</label>
        <input
          id="archive-files-password"
          name="filesPassword"
          type="password"
          className="input"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          disabled={busy}
        />
      </div>
      <div className="field field-full">
        <Button
          variant="secondary"
          type="submit"
          disabled={busy}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {busy ? progress || 'Restoring…' : 'Restore attachments'}
        </Button>
      </div>
    </form>
  );
}
