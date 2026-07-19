'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  runHealthCheckSuite,
  setTenantEnvironment,
  wipeHealthCheckRun,
  type HealthRunRow,
  type HealthStepResult,
} from '@/app/actions/health-check';
import { Button } from '@/components/ui/bookone-ui';

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    passed: { bg: 'rgba(22,163,74,0.12)', color: '#15803d', label: 'Passed' },
    failed: { bg: 'rgba(220,38,38,0.12)', color: '#b91c1c', label: 'Failed' },
    running: { bg: 'rgba(37,99,235,0.12)', color: '#1d4ed8', label: 'Running' },
    skipped: { bg: 'rgba(100,116,139,0.12)', color: '#475569', label: 'Skipped' },
    pending: { bg: 'rgba(100,116,139,0.08)', color: '#64748b', label: 'Pending' },
    production: { bg: 'rgba(220,38,38,0.12)', color: '#b91c1c', label: 'Production' },
    staging: { bg: 'rgba(22,163,74,0.12)', color: '#15803d', label: 'Staging' },
  };
  const s = map[status] ?? map.pending!;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}

function StepRow({ step }: { step: HealthStepResult }) {
  const icon =
    step.status === 'passed'
      ? '✅'
      : step.status === 'failed'
        ? '❌'
        : step.status === 'running'
          ? '⏳'
          : step.status === 'skipped'
            ? '⏭'
            : '○';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr auto',
        gap: 10,
        alignItems: 'start',
        padding: '12px 0',
        borderBottom: '1px solid var(--line, #e5e7eb)',
      }}
    >
      <div style={{ fontSize: 18, lineHeight: 1.2 }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{step.title}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft, #64748b)', marginTop: 3 }}>
          {step.detail}
        </div>
        {step.error ? (
          <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4, fontWeight: 600 }}>
            {step.error}
          </div>
        ) : null}
      </div>
      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--ink-soft, #64748b)' }}>
        {step.ms != null ? `${step.ms} ms` : ''}
        <div style={{ marginTop: 4 }}>{statusBadge(step.status)}</div>
      </div>
    </div>
  );
}

export function HealthCheckPanel({
  environment: initialEnv,
  canRun: initialCanRun,
  recentRuns: initialRuns,
}: {
  environment: 'production' | 'staging';
  canRun: boolean;
  recentRuns: HealthRunRow[];
}) {
  const [environment, setEnvironment] = useState(initialEnv);
  const [canRun, setCanRun] = useState(initialCanRun);
  const [runs, setRuns] = useState(initialRuns);
  const [live, setLive] = useState<HealthRunRow | null>(initialRuns[0] ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const passCount = useMemo(() => {
    if (!live) return null;
    const passed = live.steps.filter((s) => s.status === 'passed').length;
    const total = live.steps.filter((s) => s.status !== 'skipped').length;
    return { passed, total };
  }, [live]);

  function switchEnv(next: 'production' | 'staging') {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await setTenantEnvironment(next);
      if (!res.ok) {
        setError(res.error ?? 'Could not change environment');
        return;
      }
      setEnvironment(next);
      setCanRun(next === 'staging');
      setMessage(
        next === 'staging'
          ? 'Company marked STAGING — you can run the health suite.'
          : 'Company marked PRODUCTION — health suite locked.',
      );
    });
  }

  function runSuite(suite: 'full' | 'core') {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await runHealthCheckSuite({ suite });
      if (!res.ok && !res.run) {
        setError(res.error ?? 'Run failed');
        return;
      }
      if (res.run) {
        setLive(res.run);
        setRuns((prev) => [res.run!, ...prev.filter((r) => r.id !== res.run!.id)].slice(0, 15));
      }
      if (res.ok) {
        setMessage(res.run?.summary ?? 'All steps passed.');
      } else {
        setError(res.error ?? res.run?.errorMessage ?? 'Suite finished with failures.');
      }
    });
  }

  function wipe(runId: string) {
    if (!confirm('Void documents and product created by this health-check run? Journals stay for audit.')) {
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await wipeHealthCheckRun(runId);
      if (!res.ok) {
        setError(res.error ?? 'Wipe failed');
        return;
      }
      setMessage(`Wiped ${res.wiped ?? 0} records from run.`);
      setRuns((prev) =>
        prev.map((r) =>
          r.id === runId
            ? { ...r, summary: `${r.summary ?? ''} · wiped ${res.wiped}`.trim() }
            : r,
        ),
      );
    });
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Environment gate */}
      <section className="card pad">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              COMPANY ENVIRONMENT
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {statusBadge(environment)}
              <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                Health suite may only create test data on <strong>Staging</strong> companies.
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="button"
              variant={environment === 'staging' ? 'primary' : 'secondary'}
              disabled={pending || environment === 'staging'}
              onClick={() => switchEnv('staging')}
            >
              Mark as Staging
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || environment === 'production'}
              onClick={() => switchEnv('production')}
            >
              Mark as Production
            </Button>
          </div>
        </div>
        {environment === 'production' ? (
          <p style={{ marginTop: 12, fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>
            Locked: switch to Staging first. Never run this on a real live company with real books.
          </p>
        ) : (
          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-soft)' }}>
            Staging mode is on. Runs create real products, purchases, sales, and payments in this
            company so you can see them in normal lists and reports.
          </p>
        )}
      </section>

      {/* Actions */}
      <section className="card pad">
        <div className="eyebrow">RUN SUITE</div>
        <h2 className="card-title" style={{ marginTop: 6 }}>
          Automatic mini business day
        </h2>
        <p className="card-subtitle" style={{ marginBottom: 14 }}>
          Creates a product with varied prices, buys stock, pays the supplier, sells, receives
          payment
          {canRun ? ', optional return + GRN path, ' : ', '}
          then checks that all journals still balance. Numbers change each run (seeded).
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Button
            type="button"
            variant="primary"
            disabled={!canRun || pending}
            onClick={() => runSuite('full')}
          >
            {pending ? 'Running…' : 'Run full suite'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!canRun || pending}
            onClick={() => runSuite('core')}
          >
            Run core only
          </Button>
        </div>
        {message ? (
          <p style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: '#15803d' }}>{message}</p>
        ) : null}
        {error ? (
          <p style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: '#b91c1c' }}>{error}</p>
        ) : null}
      </section>

      {/* Live / latest result */}
      <section className="card pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">LATEST RESULT</div>
            <h2 className="card-title" style={{ marginTop: 6 }}>
              {live ? live.summary ?? 'Run result' : 'No runs yet'}
            </h2>
            {live ? (
              <p className="card-subtitle">
                Seed {live.seed} · suite {live.suite} · {new Date(live.startedAt).toLocaleString()}
                {passCount ? ` · ${passCount.passed}/${passCount.total} steps` : ''}
              </p>
            ) : (
              <p className="card-subtitle">Start a full suite to see each step here.</p>
            )}
          </div>
          {live ? statusBadge(live.status) : null}
        </div>

        {live ? (
          <div style={{ marginTop: 8 }}>
            {live.steps.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
            {Object.keys(live.created).length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 8 }}>
                  CREATED (open in modules)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
                  {live.created.productSku ? (
                    <a className="badge neutral" href="/inventory/products">
                      Product {live.created.productSku}
                    </a>
                  ) : null}
                  {live.created.purchaseId ? (
                    <a className="badge neutral" href={`/purchase/purchases/${live.created.purchaseId}`}>
                      Purchase
                    </a>
                  ) : null}
                  {live.created.invoiceId ? (
                    <a className="badge neutral" href={`/sales/invoices/${live.created.invoiceId}`}>
                      Invoice
                    </a>
                  ) : null}
                  {live.created.returnId ? (
                    <a className="badge neutral" href={`/sales/returns/${live.created.returnId}`}>
                      Return
                    </a>
                  ) : null}
                  {live.created.grnId ? (
                    <a className="badge neutral" href={`/purchase/receipts/${live.created.grnId}`}>
                      GRN
                    </a>
                  ) : null}
                  <a className="badge neutral" href="/journal">
                    Journal
                  </a>
                  <a className="badge neutral" href="/reports">
                    Reports
                  </a>
                </div>
                {canRun ? (
                  <div style={{ marginTop: 12 }}>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => wipe(live.id)}
                    >
                      Wipe this run&apos;s docs/product
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* History */}
      {runs.length > 1 ? (
        <section className="card pad">
          <div className="eyebrow">HISTORY</div>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Suite</th>
                  <th>Seed</th>
                  <th>Status</th>
                  <th>Summary</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.startedAt).toLocaleString()}</td>
                    <td>{r.suite}</td>
                    <td>{r.seed}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td style={{ fontSize: 12 }}>{r.summary}</td>
                    <td>
                      <Button type="button" variant="secondary" onClick={() => setLive(r)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Legend */}
      <section className="card pad">
        <div className="eyebrow">WHAT EACH STEP MEANS</div>
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
          <li>
            <strong>Product</strong> — inventory master works
          </li>
          <li>
            <strong>Purchase + pay</strong> — stock in, supplier bill, then pay from cash
          </li>
          <li>
            <strong>Sale + receive</strong> — stock out, customer invoice, then get paid
          </li>
          <li>
            <strong>Return</strong> (full) — restock path
          </li>
          <li>
            <strong>GRN path</strong> (full) — order → receive goods → bill without double stock
          </li>
          <li>
            <strong>Books balanced</strong> — every journal debit equals credit
          </li>
        </ul>
      </section>
    </div>
  );
}
