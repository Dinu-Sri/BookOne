'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

type RunStatus = 'idle' | 'queued' | 'running' | 'passed' | 'failed' | 'error';

type Bucket = {
  id: string;
  label: string;
  description: string;
  eta: string;
  files: string[];
  group: string;
};

type Preset = {
  id: string;
  label: string;
  description: string;
  eta: string;
  buckets: string[];
};

type FailureItem = {
  title: string;
  file: string;
  bucket: string;
  bucketLabel: string;
  errorShort: string;
  humanHint: string;
};

type Summary = {
  totals: { passed: number; failed: number; skipped: number; timedOut: number };
  byBucket: Array<{
    id: string;
    label: string;
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
    failures: FailureItem[];
  }>;
  failures: FailureItem[];
};

const GROUP_ORDER = ['foundation', 'money', 'platform', 'matrix', 'depth'] as const;
const GROUP_LABEL: Record<string, string> = {
  foundation: 'Foundation',
  money: 'Money paths',
  platform: 'Platform & integrity',
  matrix: 'Matrices (slower)',
  depth: 'Depth / remainder',
};

/**
 * Professional E2E console — bucketed runs, human failure board, downloadable MD.
 */
export default function E2eConsolePage() {
  const [baseUrl, setBaseUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [suite, setSuite] = useState('core');
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [runId, setRunId] = useState<string | null>(null);
  const [log, setLog] = useState('Select a preset or bucket, enter credentials, then Start.');
  const [meta, setMeta] = useState('No active run.');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [bucketFiles, setBucketFiles] = useState<string[]>([]);
  const [openFail, setOpenFail] = useState<string | null>(null);
  const [autoProgress, setAutoProgress] = useState('');
  const autoRef = useRef({
    active: false,
    queue: [] as string[],
    index: 0,
    results: [] as { bucket: string; status: string; failed: number }[],
  });

  useEffect(() => {
    setBaseUrl(window.location.origin);
    fetch('/api/e2e/buckets')
      .then((r) => r.json())
      .then((j) => {
        setBuckets(j.buckets || []);
        setPresets(j.presets || []);
      })
      .catch(() => undefined);
  }, []);

  async function downloadFailures(id: string, bucketId: string) {
    try {
      const r = await fetch(`/api/e2e/runs/${id}/failures`);
      if (!r.ok) return;
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bookone-e2e-${bucketId}-failures.md`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 800);
    } catch {
      /* ignore */
    }
  }

  const poll = useCallback(async (id: string) => {
    const r = await fetch(`/api/e2e/runs/${id}`);
    if (!r.ok) return false;
    const j = await r.json();
    setStatus(j.status);
    setMeta(
      `${j.id?.slice(0, 8)}… · ${j.suite || '—'} · ${j.baseUrl} · exit ${j.exitCode ?? '—'}`,
    );
    setLog((j.log || []).join('\n') || '(no log yet)');
    if (j.summary) setSummary(j.summary);
    if (j.bucketFailureFiles) setBucketFiles(j.bucketFailureFiles);
    return ['passed', 'failed', 'error'].includes(j.status);
  }, []);

  async function startSuite(suiteId: string) {
    setSuite(suiteId);
    setStatus('queued');
    setSummary(null);
    setBucketFiles([]);
    setLog(`Starting suite/bucket: ${suiteId}…`);
    const r = await fetch('/api/e2e/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password,
        baseUrl: baseUrl.trim() || window.location.origin,
        suite: suiteId,
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed to start');
    setRunId(j.id);
    setStatus(j.status || 'running');
    return j.id as string;
  }

  useEffect(() => {
    if (!runId || !['queued', 'running'].includes(status)) return;
    const t = setInterval(async () => {
      const done = await poll(runId);
      if (!done) return;
      clearInterval(t);

      const auto = autoRef.current;
      if (!auto.active) {
        setBusy(false);
        return;
      }

      // Auto chain: download on fail, then next bucket
      const r = await fetch(`/api/e2e/runs/${runId}`);
      const j = r.ok ? await r.json() : null;
      const bucketId = auto.queue[auto.index] || j?.suite || suite;
      const failed = j?.status === 'failed' || j?.status === 'error';
      const failedCount = j?.summary?.totals?.failed ?? (failed ? 1 : 0);
      auto.results.push({ bucket: bucketId, status: j?.status || 'error', failed: failedCount });

      if (failed && failedCount > 0) {
        setAutoProgress(
          `Bucket ${auto.index + 1}/${auto.queue.length} “${bucketId}” FAILED — downloading failures.md…`,
        );
        await downloadFailures(runId, bucketId);
        await new Promise((res) => setTimeout(res, 600));
      } else {
        setAutoProgress(
          `Bucket ${auto.index + 1}/${auto.queue.length} “${bucketId}” passed — next…`,
        );
      }

      auto.index += 1;
      if (auto.index >= auto.queue.length) {
        auto.active = false;
        setBusy(false);
        const fails = auto.results.filter((x) => x.status !== 'passed');
        setAutoProgress(
          `Auto-run complete. ${auto.results.length} buckets · ${fails.length} with failures.`,
        );
        setLog(
          (prev) =>
            prev +
            '\n\n=== AUTO-RUN SUMMARY ===\n' +
            auto.results.map((x) => `${x.bucket}: ${x.status}`).join('\n'),
        );
        return;
      }

      await new Promise((res) => setTimeout(res, 2000));
      try {
        setAutoProgress(
          `Running bucket ${auto.index + 1}/${auto.queue.length}: ${auto.queue[auto.index]}`,
        );
        await startSuite(auto.queue[auto.index]!);
      } catch (e) {
        auto.active = false;
        setBusy(false);
        setStatus('error');
        setAutoProgress(`Auto-run stopped: ${e}`);
      }
    }, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, status, poll]);

  async function start() {
    autoRef.current.active = false;
    setBusy(true);
    setAutoProgress('');
    try {
      await startSuite(suite);
    } catch (e) {
      setStatus('error');
      setLog(String(e));
      setBusy(false);
    }
  }

  async function startAutoAll() {
    if (!email.trim() || !password) {
      alert('Enter email and password first.');
      return;
    }
    if (!buckets.length) {
      alert('Buckets not loaded yet.');
      return;
    }
    const auto = autoRef.current;
    auto.active = true;
    auto.queue = buckets.map((b) => b.id).filter((id) => id !== 'sweep');
    auto.index = 0;
    auto.results = [];
    setBusy(true);
    setAutoProgress(`Auto-run starting: ${auto.queue.length} buckets…`);
    try {
      await startSuite(auto.queue[0]!);
    } catch (e) {
      auto.active = false;
      setBusy(false);
      setStatus('error');
      setLog(String(e));
      setAutoProgress('');
    }
  }

  const done = ['passed', 'failed', 'error'].includes(status);
  const selectedBucket = useMemo(() => buckets.find((b) => b.id === suite), [buckets, suite]);
  const selectedPreset = useMemo(() => presets.find((p) => p.id === suite), [presets, suite]);

  const grouped = useMemo(() => {
    const m = new Map<string, Bucket[]>();
    for (const g of GROUP_ORDER) m.set(g, []);
    for (const b of buckets) {
      const g = m.get(b.group) || m.get('depth')!;
      g.push(b);
    }
    return m;
  }, [buckets]);

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.header}>
          <div>
            <p style={styles.kicker}>BookOne QA</p>
            <h1 style={styles.h1}>E2E Test Console</h1>
            <p style={styles.lead}>
              Run Playwright UI tests by <strong>bucket</strong> (one domain at a time) or a{' '}
              <strong>preset</strong> (smoke / p0 / core / full). After a run, failures appear below in
              plain language — download MD files for engineering.
            </p>
          </div>
          <div style={{ ...styles.badge, ...badgeColor(status) }}>{status}</div>
        </header>

        <section style={styles.card}>
          <h2 style={styles.h2}>1. Target & credentials</h2>
          <label style={styles.label}>App URL under test</label>
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
          <p style={styles.hint}>Use a staging user. Auth packs intentionally fail login a few times — prefer running buckets one by one.</p>
        </section>

        <section style={styles.card}>
          <h2 style={styles.h2}>2. What to run</h2>
          <p style={styles.sub}>Presets (multi-bucket)</p>
          <div style={styles.chipRow}>
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => setSuite(p.id)}
                style={{
                  ...styles.chip,
                  ...(suite === p.id ? styles.chipActive : null),
                }}
                title={p.description}
              >
                <strong>{p.label}</strong>
                <span style={styles.chipEta}>{p.eta}</span>
              </button>
            ))}
          </div>

          <p style={{ ...styles.sub, marginTop: 18 }}>Buckets (run one domain — recommended for fixing)</p>
          {GROUP_ORDER.map((g) => {
            const list = grouped.get(g) || [];
            if (!list.length) return null;
            return (
              <div key={g} style={{ marginBottom: 14 }}>
                <div style={styles.groupTitle}>{GROUP_LABEL[g] || g}</div>
                <div style={styles.bucketGrid}>
                  {list.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      disabled={busy}
                      onClick={() => setSuite(b.id)}
                      style={{
                        ...styles.bucketCard,
                        ...(suite === b.id ? styles.bucketCardActive : null),
                      }}
                    >
                      <div style={styles.bucketTop}>
                        <span style={styles.bucketLabel}>{b.label}</span>
                        <span style={styles.chipEta}>{b.eta}</span>
                      </div>
                      <div style={styles.bucketDesc}>{b.description}</div>
                      <code style={styles.bucketId}>{b.id}</code>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          <div style={styles.selectedBar}>
            <div>
              <div style={styles.label}>Selected</div>
              <div style={{ fontWeight: 750, fontSize: 15 }}>
                {selectedPreset?.label || selectedBucket?.label || suite}
                <span style={{ ...styles.chipEta, marginLeft: 8 }}>
                  {selectedPreset?.eta || selectedBucket?.eta || ''}
                </span>
              </div>
              <div style={styles.bucketDesc}>
                {selectedPreset?.description || selectedBucket?.description || `suite=${suite}`}
              </div>
            </div>
            <div style={styles.actions}>
              <button style={styles.primary} type="button" disabled={busy || !email || !password} onClick={start}>
                {busy && !autoProgress ? 'Running…' : 'Start run'}
              </button>
              <button
                style={{ ...styles.primary, background: '#0f766e' }}
                type="button"
                disabled={busy || !email || !password}
                onClick={startAutoAll}
                title="Run every domain bucket one-by-one. On failure, auto-download failures.md then continue."
              >
                {busy && autoProgress ? 'Auto-running…' : 'Auto-run all buckets'}
              </button>
            </div>
          </div>
          <p style={styles.hint}>
            <strong>Auto-run all buckets:</strong> walks every domain pack in order. If a bucket fails, downloads that
            run’s agent <code>failures.md</code> to your browser Downloads folder, then continues to the next.
          </p>
          <p style={styles.meta}>{meta}</p>
          {autoProgress ? <p style={{ ...styles.meta, color: '#0f766e', fontWeight: 650 }}>{autoProgress}</p> : null}
        </section>

        {(summary || done) && (
          <section style={styles.card}>
            <h2 style={styles.h2}>3. Results</h2>
            {summary ? (
              <>
                <div style={styles.statRow}>
                  <Stat label="Passed" value={summary.totals.passed} tone="ok" />
                  <Stat label="Failed" value={summary.totals.failed} tone="bad" />
                  <Stat label="Skipped" value={summary.totals.skipped} tone="muted" />
                  <Stat label="Timed out" value={summary.totals.timedOut} tone="warn" />
                </div>

                {summary.byBucket.length > 0 && (
                  <>
                    <p style={styles.sub}>By bucket</p>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <th style={styles.th}>Bucket</th>
                            <th style={styles.thNum}>Pass</th>
                            <th style={styles.thNum}>Fail</th>
                            <th style={styles.thNum}>Skip</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.byBucket.map((b) => (
                            <tr key={b.id}>
                              <td style={styles.td}>
                                {b.label}{' '}
                                <code style={styles.bucketId}>{b.id}</code>
                              </td>
                              <td style={styles.tdNum}>{b.passed}</td>
                              <td style={{ ...styles.tdNum, color: b.failed ? '#c94141' : undefined, fontWeight: b.failed ? 750 : 400 }}>
                                {b.failed}
                              </td>
                              <td style={styles.tdNum}>{b.skipped}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {summary.failures.length > 0 && (
                  <>
                    <p style={{ ...styles.sub, marginTop: 16 }}>Failures (human-readable)</p>
                    <div style={styles.failList}>
                      {summary.failures.map((f) => {
                        const key = `${f.bucket}:${f.title}`;
                        const open = openFail === key;
                        return (
                          <div key={key} style={styles.failCard}>
                            <button
                              type="button"
                              style={styles.failHead}
                              onClick={() => setOpenFail(open ? null : key)}
                            >
                              <span style={styles.failBadge}>{f.bucketLabel}</span>
                              <span style={styles.failTitle}>{f.title}</span>
                              <span style={styles.failErr}>{f.errorShort}</span>
                            </button>
                            {open && (
                              <div style={styles.failBody}>
                                <p style={{ margin: '0 0 8px' }}>
                                  <strong>What to do:</strong> {f.humanHint}
                                </p>
                                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#5b6b7f' }}>
                                  File: <code>{f.file}</code>
                                </p>
                                <button
                                  type="button"
                                  style={styles.smallBtn}
                                  onClick={() => setSuite(f.bucket)}
                                  disabled={busy}
                                >
                                  Select bucket “{f.bucket}” to re-run
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                {summary.failures.length === 0 && status === 'passed' && (
                  <p style={{ color: '#15835f', fontWeight: 650 }}>All tests in this run passed.</p>
                )}
              </>
            ) : (
              <p style={styles.hint}>Summary appears when Playwright finishes writing results.</p>
            )}

            <div style={{ ...styles.actions, marginTop: 16 }}>
              <a
                style={{ ...styles.secondary, ...linkState(done && !!runId) }}
                href={runId ? `/api/e2e/runs/${runId}/report` : '#'}
              >
                report.md
              </a>
              <a
                style={{ ...styles.secondary, ...linkState(done && !!runId) }}
                href={runId ? `/api/e2e/runs/${runId}/failures` : '#'}
              >
                failures.md (agent)
              </a>
              <a
                style={{ ...styles.secondary, ...linkState(done && !!runId) }}
                href={runId ? `/api/e2e/runs/${runId}/log` : '#'}
              >
                Full log
              </a>
              <a
                style={{ ...styles.secondary, ...linkState(done && !!runId) }}
                href={runId ? `/api/e2e/runs/${runId}/download` : '#'}
              >
                Full bundle
              </a>
              {bucketFiles.map((f) => {
                const id = f.replace(/-failures\.md$/, '');
                return (
                  <a
                    key={f}
                    style={{ ...styles.secondary, ...linkState(done && !!runId), borderColor: '#f0c2c2' }}
                    href={runId ? `/api/e2e/runs/${runId}/buckets/${id}` : '#'}
                  >
                    {f}
                  </a>
                );
              })}
            </div>
          </section>
        )}

        <section style={styles.card}>
          <h2 style={styles.h2}>Live log</h2>
          <pre style={styles.pre}>{log}</pre>
        </section>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ok' | 'bad' | 'muted' | 'warn';
}) {
  const color =
    tone === 'ok' ? '#15835f' : tone === 'bad' ? '#c94141' : tone === 'warn' ? '#b86e00' : '#5b6b7f';
  return (
    <div style={styles.stat}>
      <div style={{ ...styles.statVal, color }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function linkState(ok: boolean): CSSProperties {
  return { pointerEvents: ok ? 'auto' : 'none', opacity: ok ? 1 : 0.45 };
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
    background: 'linear-gradient(180deg, #f0f4f9 0%, #f7f9fc 40%, #f7f9fc 100%)',
    color: '#132238',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  wrap: { maxWidth: 1080, margin: '0 auto', padding: '28px 18px 56px' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 20,
  },
  kicker: {
    margin: 0,
    fontSize: 11,
    fontWeight: 750,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#1677c9',
  },
  h1: { margin: '4px 0 8px', fontSize: 26, letterSpacing: '-0.02em' },
  h2: { margin: '0 0 12px', fontSize: 15, fontWeight: 750 },
  lead: { color: '#5b6b7f', margin: 0, fontSize: 14, lineHeight: 1.55, maxWidth: 720 },
  card: {
    background: '#fff',
    border: '1px solid #dde5ef',
    borderRadius: 12,
    padding: 18,
    marginBottom: 14,
    boxShadow: '0 1px 2px rgba(19, 34, 56, 0.05)',
  },
  label: { display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#3a4a5c' },
  input: {
    width: '100%',
    minHeight: 40,
    border: '1px solid #dde5ef',
    borderRadius: 8,
    padding: '0 12px',
    font: 'inherit',
    marginBottom: 12,
    boxSizing: 'border-box',
    background: '#fbfdff',
  },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  primary: {
    minHeight: 44,
    borderRadius: 10,
    border: 0,
    background: '#1677c9',
    color: '#fff',
    fontWeight: 750,
    padding: '0 20px',
    cursor: 'pointer',
    fontSize: 14,
  },
  secondary: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 34,
    borderRadius: 8,
    border: '1px solid #dde5ef',
    background: '#fff',
    color: '#132238',
    fontWeight: 650,
    padding: '0 12px',
    textDecoration: 'none',
    fontSize: 12,
  },
  badge: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 750,
    flexShrink: 0,
  },
  meta: { fontSize: 13, color: '#5b6b7f', margin: '10px 0 0' },
  hint: { fontSize: 12, color: '#5b6b7f', margin: '0 0 4px', lineHeight: 1.45 },
  sub: {
    margin: '0 0 8px',
    fontSize: 12,
    fontWeight: 750,
    color: '#5b6b7f',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: {
    border: '1px solid #dde5ef',
    background: '#f8fafc',
    borderRadius: 10,
    padding: '10px 12px',
    cursor: 'pointer',
    textAlign: 'left' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 120,
  },
  chipActive: {
    borderColor: '#1677c9',
    background: '#e8f4ff',
    boxShadow: '0 0 0 1px #1677c9',
  },
  chipEta: { fontSize: 11, color: '#5b6b7f', fontWeight: 600 },
  groupTitle: {
    fontSize: 13,
    fontWeight: 750,
    marginBottom: 8,
    color: '#3a4a5c',
  },
  bucketGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 8,
  },
  bucketCard: {
    border: '1px solid #e3eaf3',
    background: '#fbfdff',
    borderRadius: 10,
    padding: 12,
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  bucketCardActive: {
    borderColor: '#1677c9',
    background: '#f0f7ff',
    boxShadow: '0 0 0 1px #1677c9',
  },
  bucketTop: { display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  bucketLabel: { fontWeight: 750, fontSize: 13 },
  bucketDesc: { fontSize: 12, color: '#5b6b7f', lineHeight: 1.4, marginBottom: 6 },
  bucketId: {
    fontSize: 10,
    background: '#eef3f8',
    padding: '2px 6px',
    borderRadius: 4,
    color: '#3a4a5c',
  },
  selectedBar: {
    marginTop: 16,
    paddingTop: 14,
    borderTop: '1px solid #e8eef5',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap' as const,
  },
  pre: {
    margin: 0,
    maxHeight: 320,
    overflow: 'auto',
    background: '#0f172a',
    color: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    fontSize: 11.5,
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
  },
  statRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 },
  stat: {
    background: '#f6f9fc',
    borderRadius: 10,
    padding: '12px 10px',
    textAlign: 'center' as const,
    border: '1px solid #e8eef5',
  },
  statVal: { fontSize: 22, fontWeight: 800 },
  statLabel: { fontSize: 11, color: '#5b6b7f', fontWeight: 650, marginTop: 2 },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: {
    textAlign: 'left' as const,
    padding: '8px 6px',
    borderBottom: '1px solid #e3eaf3',
    color: '#5b6b7f',
    fontSize: 11,
    textTransform: 'uppercase' as const,
  },
  thNum: {
    textAlign: 'right' as const,
    padding: '8px 6px',
    borderBottom: '1px solid #e3eaf3',
    color: '#5b6b7f',
    fontSize: 11,
  },
  td: { padding: '8px 6px', borderBottom: '1px solid #f0f4f8' },
  tdNum: { padding: '8px 6px', borderBottom: '1px solid #f0f4f8', textAlign: 'right' as const },
  failList: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  failCard: {
    border: '1px solid #f0d4d4',
    borderRadius: 10,
    background: '#fffbfb',
    overflow: 'hidden',
  },
  failHead: {
    width: '100%',
    border: 0,
    background: 'transparent',
    padding: 12,
    cursor: 'pointer',
    textAlign: 'left' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  failBadge: {
    fontSize: 10,
    fontWeight: 750,
    color: '#c94141',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  failTitle: { fontWeight: 700, fontSize: 13 },
  failErr: { fontSize: 12, color: '#7a3a3a' },
  failBody: {
    padding: '0 12px 12px',
    borderTop: '1px solid #f5e4e4',
    paddingTop: 10,
    fontSize: 13,
    lineHeight: 1.45,
  },
  smallBtn: {
    border: '1px solid #dde5ef',
    background: '#fff',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 650,
    cursor: 'pointer',
  },
};
