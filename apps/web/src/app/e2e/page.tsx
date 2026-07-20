'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';

type RunStatus = 'idle' | 'queued' | 'running' | 'passed' | 'failed' | 'error';

/**
 * Public E2E console at /e2e — no BookOne login required to open this page.
 * You enter credentials for the *target* app (usually this same origin).
 */
export default function E2eConsolePage() {
  const [baseUrl, setBaseUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<RunStatus>('idle');
  const [runId, setRunId] = useState<string | null>(null);
  const [log, setLog] = useState('Ready. Enter credentials and press Start.');
  const [meta, setMeta] = useState('No active run.');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  const poll = useCallback(async (id: string) => {
    const r = await fetch(`/api/e2e/runs/${id}`);
    if (!r.ok) return false;
    const j = await r.json();
    setStatus(j.status);
    setMeta(`${j.id?.slice(0, 8)}… · ${j.baseUrl} · exit ${j.exitCode ?? '—'}`);
    setLog((j.log || []).join('\n') || '(no log yet)');
    return ['passed', 'failed', 'error'].includes(j.status);
  }, []);

  useEffect(() => {
    if (!runId || !['queued', 'running'].includes(status)) return;
    const t = setInterval(async () => {
      const done = await poll(runId);
      if (done) {
        setBusy(false);
        clearInterval(t);
      }
    }, 1500);
    return () => clearInterval(t);
  }, [runId, status, poll]);

  async function start() {
    setBusy(true);
    setStatus('queued');
    setLog('Starting…');
    try {
      const r = await fetch('/api/e2e/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          baseUrl: baseUrl.trim() || window.location.origin,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setStatus('error');
        setLog(j.error || 'Failed to start');
        setBusy(false);
        return;
      }
      setRunId(j.id);
      setStatus(j.status || 'running');
      await poll(j.id);
    } catch (e) {
      setStatus('error');
      setLog(String(e));
      setBusy(false);
    }
  }

  const done = ['passed', 'failed', 'error'].includes(status);

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <h1 style={styles.h1}>BookOne E2E</h1>
        <p style={styles.lead}>
          Open this page at <strong>/e2e</strong>. Enter a BookOne user email and password, then Start.
          Playwright logs in and checks core screens. Download the report when finished.
        </p>

        <section style={styles.card}>
          <label style={styles.label}>Target app URL</label>
          <input
            style={styles.input}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://bookone.example.com"
          />
          <div style={styles.row}>
            <div>
              <label style={styles.label}>Email</label>
              <input
                style={styles.input}
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label style={styles.label}>Password</label>
              <input
                style={styles.input}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>
          <div style={styles.actions}>
            <button style={styles.primary} type="button" disabled={busy} onClick={start}>
              {busy ? 'Running…' : 'Start E2E run'}
            </button>
            <span style={{ ...styles.badge, ...badgeColor(status) }}>{status}</span>
            <span style={styles.meta}>{meta}</span>
          </div>
          <p style={styles.hint}>
            No separate secret. Use a staging user when possible. Playwright must be installed once on the
            server: <code>cd apps/e2e-runner && npm i && npx playwright install chromium</code>
          </p>
        </section>

        <section style={styles.card}>
          <div style={{ ...styles.actions, marginBottom: 10 }}>
            <a
              style={{ ...styles.secondary, pointerEvents: done && runId ? 'auto' : 'none', opacity: done ? 1 : 0.5 }}
              href={runId ? `/api/e2e/runs/${runId}/report` : '#'}
            >
              Download report.md
            </a>
            <a
              style={{ ...styles.secondary, pointerEvents: done && runId ? 'auto' : 'none', opacity: done ? 1 : 0.5 }}
              href={runId ? `/api/e2e/runs/${runId}/log` : '#'}
            >
              Download log
            </a>
            <a
              style={{ ...styles.secondary, pointerEvents: done && runId ? 'auto' : 'none', opacity: done ? 1 : 0.5 }}
              href={runId ? `/api/e2e/runs/${runId}/download` : '#'}
            >
              Download full bundle
            </a>
          </div>
          <pre style={styles.pre}>{log}</pre>
        </section>
      </div>
    </main>
  );
}

function badgeColor(status: RunStatus): CSSProperties {
  if (status === 'passed') return { background: '#e8f7f0', color: '#15835f' };
  if (status === 'failed' || status === 'error') return { background: '#fff0f0', color: '#c94141' };
  if (status === 'running' || status === 'queued') return { background: '#e8f4ff', color: '#1677c9' };
  return { background: '#eef3f8', color: '#5b6b7f' };
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    margin: 0,
    background: '#f6f8fb',
    color: '#132238',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  wrap: { maxWidth: 960, margin: '0 auto', padding: '28px 18px 48px' },
  h1: { margin: '0 0 6px', fontSize: 22 },
  lead: { color: '#5b6b7f', margin: '0 0 22px', fontSize: 14, lineHeight: 1.5 },
  card: {
    background: '#fff',
    border: '1px solid #dde5ef',
    borderRadius: 10,
    padding: 18,
    marginBottom: 16,
    boxShadow: '0 1px 2px rgba(19, 34, 56, 0.06)',
  },
  label: { display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 },
  input: {
    width: '100%',
    minHeight: 40,
    border: '1px solid #dde5ef',
    borderRadius: 8,
    padding: '0 12px',
    font: 'inherit',
    marginBottom: 12,
    boxSizing: 'border-box',
  },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  primary: {
    minHeight: 40,
    borderRadius: 8,
    border: 0,
    background: '#1677c9',
    color: '#fff',
    fontWeight: 750,
    padding: '0 16px',
    cursor: 'pointer',
  },
  secondary: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 36,
    borderRadius: 8,
    border: '1px solid #dde5ef',
    background: '#fff',
    color: '#132238',
    fontWeight: 700,
    padding: '0 12px',
    textDecoration: 'none',
    fontSize: 13,
  },
  badge: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 750,
  },
  meta: { fontSize: 13, color: '#5b6b7f' },
  hint: { fontSize: 12, color: '#5b6b7f', marginTop: 8, lineHeight: 1.45 },
  pre: {
    margin: 0,
    maxHeight: 420,
    overflow: 'auto',
    background: '#0f172a',
    color: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
  },
};
