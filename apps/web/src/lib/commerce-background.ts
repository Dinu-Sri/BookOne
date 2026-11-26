import { pgClient } from '@bookone/db';
import { withCommerceService } from '@/lib/commerce-runtime';

/**
 * WP3/WP4 background work, every few seconds in the web process:
 * - expire stock reservations (they already stop counting at expiresAt; this
 *   records it and emits `reservation` / `inventory` changes);
 * - queue new change-feed items for each webhook and deliver due ones with
 *   retries (exponential backoff for 24 hours).
 * Only companies with work are visited (SECURITY DEFINER lookup, tenant ids only).
 */
const INTERVAL_MS = 5_000;
let running = false;

export async function postWebhook(url: string, body: string, headers: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    body,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  await res.arrayBuffer().catch(() => undefined);
  return { status: res.status };
}

export async function runCommerceBackgroundOnce(): Promise<{ tenants: number; queued: number; sent: number }> {
  if (running) return { tenants: 0, queued: 0, sent: 0 };
  running = true;
  try {
    let tenants: string[] = [];
    try {
      const rows = await pgClient()<{ tenant_id: string }[]>`SELECT tenant_id FROM bookone_commerce_background_tenants()`;
      tenants = rows.map((r) => r.tenant_id);
    } catch {
      return { tenants: 0, queued: 0, sent: 0 }; // function not migrated yet
    }
    let queued = 0;
    let sent = 0;
    for (const tenantId of tenants) {
      try {
        const out = await withCommerceService(tenantId, (service) => service.runBackground(tenantId, postWebhook));
        queued += out.queued;
        sent += out.sent;
      } catch (error) {
        console.error('[commerce-background]', tenantId, error instanceof Error ? error.message : error);
      }
    }
    return { tenants: tenants.length, queued, sent };
  } finally {
    running = false;
  }
}

/** Started lazily by the first Commerce API request or Commerce page load in this process. */
export function startCommerceBackground() {
  const g = globalThis as { __bookoneCommerceBackground?: NodeJS.Timeout };
  if (g.__bookoneCommerceBackground) return;
  if (process.env.COMMERCE_BACKGROUND === 'off') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  g.__bookoneCommerceBackground = setInterval(() => {
    void runCommerceBackgroundOnce().catch(() => undefined);
  }, INTERVAL_MS);
  g.__bookoneCommerceBackground.unref?.();
}
