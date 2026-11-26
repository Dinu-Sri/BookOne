'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { commerceWebhookActionFromForm, createCommerceWebhookFromForm } from '@/app/actions/commerce';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { withFormPending } from '@/components/ui/form-busy';
import { TextField } from '@/components/ui/text-field';

export type WebhookView = {
  id: string;
  url: string;
  kinds: string[];
  status: string;
  lastSuccessAt: string | null;
  failingSince: string | null;
  lastError: string | null;
  rotationOverlapUntil: string | null;
  createdAt: string;
  deliveries: Array<{
    id: string;
    itemId: string;
    kind: string;
    status: string;
    attempts: number;
    lastStatusCode: number | null;
    lastError: string | null;
    nextAttemptAt: string | null;
    deliveredAt: string | null;
    createdAt: string;
  }>;
};

export type ReservationView = {
  id: string;
  externalId: string;
  status: string;
  expiresAt: string;
  lines: Array<{ sku: string; quantity: string; held: string; status: string }>;
  createdAt: string;
};

export type ApiCallView = {
  id: string;
  keyPrefix: string | null;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  createdAt: string;
};

const KINDS = ['product', 'variant', 'price', 'image', 'inventory', 'category', 'brand', 'order', 'customer', 'reservation', 'mapping'];

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : '—';
}

/** WP4: endpoints that receive change-feed items, signed with a per-endpoint secret. */
export function CommerceWebhooksCard({ connectionId, canWrite, webhooks }: { connectionId: string; canWrite: boolean; webhooks: WebhookView[] }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [remove, setRemove] = useState<WebhookView | null>(null);

  async function add(formData: FormData) {
    setError(null);
    setMessage(null);
    const result = await withFormPending(() => createCommerceWebhookFromForm(formData));
    if (!result.ok) return setError(result.error ?? 'Could not add the webhook.');
    setSecret(result.secret ?? null);
    setUrl('');
    router.refresh();
  }

  async function act(id: string, op: 'test' | 'rotate' | 'enable' | 'delete') {
    setError(null);
    setMessage(null);
    const fd = new FormData();
    fd.set('connectionId', connectionId);
    fd.set('webhookId', id);
    fd.set('op', op);
    const result = await withFormPending(() => commerceWebhookActionFromForm(fd));
    if (!result.ok) return setError(result.error ?? 'Could not update the webhook.');
    if (result.secret) setSecret(result.secret);
    setMessage(result.message ?? null);
    router.refresh();
  }

  return (
    <section className="commerce-card">
      <h2 className="commerce-section-title">Webhooks</h2>
      <p className="field-help">
        BookOne POSTs each change (the same item as <code>/changes</code>) to your HTTPS endpoint within seconds, signed with{' '}
        <code>X-BookOne-Signature</code>. Failed deliveries are retried for 24 hours.
      </p>
      {secret ? (
        <div className="commerce-card" role="status">
          <strong>Signing secret (shown once)</strong>
          <p>
            <code style={{ wordBreak: 'break-all' }}>{secret}</code>
          </p>
          <div className="commerce-inline-actions">
            <Button type="button" onClick={() => void navigator.clipboard?.writeText(secret)}>
              Copy secret
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSecret(null)}>
              I saved it
            </Button>
          </div>
        </div>
      ) : null}
      {message ? <p className="field-help" role="status">{message}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {webhooks.length ? (
        <div className="commerce-table-scroll" tabIndex={0} role="region" aria-label="Webhooks">
          <table className="commerce-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Kinds</th>
                <th>Status</th>
                <th>Last success</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w) => (
                <tr key={w.id} className={open === w.id ? 'is-selected' : undefined}>
                  <td style={{ wordBreak: 'break-all' }}>{w.url}</td>
                  <td>{w.kinds.length ? w.kinds.join(', ') : 'All'}</td>
                  <td>
                    <Badge tone={w.status === 'active' ? 'success' : 'warning'}>{w.status === 'active' ? 'Active' : 'Failing'}</Badge>
                    {w.lastError ? <div className="field-help">{w.lastError}</div> : null}
                  </td>
                  <td>{when(w.lastSuccessAt)}</td>
                  <td className="commerce-inline-actions">
                    <Button type="button" onClick={() => setOpen(open === w.id ? null : w.id)}>
                      {open === w.id ? 'Hide log' : 'Delivery log'}
                    </Button>
                    {canWrite ? (
                      <>
                        <Button type="button" onClick={() => void act(w.id, 'test')}>
                          Send test
                        </Button>
                        <Button type="button" onClick={() => void act(w.id, 'rotate')}>
                          New secret
                        </Button>
                        {w.status !== 'active' ? (
                          <Button type="button" onClick={() => void act(w.id, 'enable')}>
                            Re-enable
                          </Button>
                        ) : null}
                        <Button type="button" variant="ghost" onClick={() => setRemove(w)}>
                          Remove
                        </Button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="field-help">No webhooks yet. Websites can also poll /changes.</p>
      )}
      {open
        ? (() => {
            const w = webhooks.find((x) => x.id === open);
            if (!w) return null;
            return (
              <div className="commerce-table-scroll" tabIndex={0} role="region" aria-label="Webhook delivery log">
                <table className="commerce-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Kind</th>
                      <th>Result</th>
                      <th>Attempts</th>
                      <th>Next try</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.deliveries.length ? (
                      w.deliveries.map((d) => (
                        <tr key={d.id}>
                          <td>{when(d.createdAt)}</td>
                          <td>{d.kind}</td>
                          <td>
                            {d.status === 'delivered' ? `Delivered (${d.lastStatusCode})` : d.status === 'failed' ? 'Gave up' : 'Retrying'}
                            {d.lastError && d.status !== 'delivered' ? <div className="field-help">{d.lastError}</div> : null}
                          </td>
                          <td>{d.attempts}</td>
                          <td>{when(d.nextAttemptAt)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5}>No deliveries yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()
        : null}
      {canWrite ? (
        <form action={add} className="commerce-panel-stack">
          <input type="hidden" name="connectionId" value={connectionId} />
          <TextField
            id={`webhook-url-${connectionId}`}
            name="url"
            label="Endpoint URL"
            placeholder="https://shop.example/api/bookone/webhook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <fieldset className="commerce-fields">
            <legend className="field-help">Changes to send (none ticked = all)</legend>
            <div className="commerce-inline-actions" style={{ flexWrap: 'wrap' }}>
              {KINDS.map((k) => (
                <label key={k} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" name="kinds" value={k} /> {k}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Button type="submit" variant="primary" disabled={!url.trim()}>
              Add webhook
            </Button>
          </div>
        </form>
      ) : null}
      <ConfirmDialog
        open={Boolean(remove)}
        title="Remove this webhook?"
        message="BookOne stops sending changes to this endpoint. Pending retries are dropped."
        confirmLabel="Remove"
        tone="danger"
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          const w = remove;
          setRemove(null);
          if (w) void act(w.id, 'delete');
        }}
      />
    </section>
  );
}

/** WP3: checkouts holding stock right now (and recent ones). */
export function CommerceReservationsCard({ reservations }: { reservations: ReservationView[] }) {
  const active = reservations.filter((r) => r.status === 'active');
  return (
    <section className="commerce-card">
      <h2 className="commerce-section-title">Stock held for checkouts</h2>
      <p className="field-help">
        While a customer pays by card, the website can hold stock for up to 60 minutes. Held units cannot be sold at the POS. A hold
        becomes the order when it arrives, or is released when it expires.
      </p>
      {reservations.length ? (
        <div className="commerce-table-scroll" tabIndex={0} role="region" aria-label="Stock held for checkouts">
          <table className="commerce-table">
            <thead>
              <tr>
                <th>Checkout</th>
                <th>Status</th>
                <th>Items</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {reservations.slice(0, 20).map((r) => (
                <tr key={r.id}>
                  <td>{r.externalId}</td>
                  <td>{r.status}</td>
                  <td>{r.lines.map((l) => `${l.sku} × ${Number(l.held)}`).join(', ')}</td>
                  <td>{r.status === 'active' ? when(r.expiresAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="field-help">No checkout holds yet.</p>
      )}
      {active.length ? <p className="field-help">{active.length} holding stock now.</p> : null}
    </section>
  );
}

/** WP7: recent API calls from this connection's keys (kept 30 days). */
export function CommerceApiLogCard({ calls }: { calls: ApiCallView[] }) {
  return (
    <section className="commerce-card">
      <h2 className="commerce-section-title">API calls</h2>
      <p className="field-help">The latest requests from this connection&apos;s keys, newest first. Kept for 30 days.</p>
      {calls.length ? (
        <div className="commerce-table-scroll" tabIndex={0} role="region" aria-label="API calls">
          <table className="commerce-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Key</th>
                <th>Request</th>
                <th>Status</th>
                <th>ms</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id}>
                  <td>{when(c.createdAt)}</td>
                  <td>{c.keyPrefix ?? '—'}</td>
                  <td style={{ wordBreak: 'break-all' }}>
                    {c.method} {c.path}
                  </td>
                  <td>{c.status}</td>
                  <td>{c.durationMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="field-help">No API calls yet.</p>
      )}
    </section>
  );
}
