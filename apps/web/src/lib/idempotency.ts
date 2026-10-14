import 'server-only';

import { and, db, eq, opsIdempotency } from '@bookone/db';
import { isCompletedIdempotencyResult } from '@/lib/idempotency-result';

export { isCompletedIdempotencyResult } from '@/lib/idempotency-result';

function norm(key: string | null | undefined) {
  const k = String(key ?? '').trim();
  return k.length >= 8 ? k.slice(0, 80) : '';
}

export async function readIdempotency<T>(tenantId: string, key: string | null | undefined): Promise<T | null> {
  const k = norm(key);
  if (!k) return null;
  try {
    const [row] = await db()
      .select({ resultJson: opsIdempotency.resultJson })
      .from(opsIdempotency)
      .where(and(eq(opsIdempotency.tenantId, tenantId), eq(opsIdempotency.key, k)))
      .limit(1);
    if (!row?.resultJson) return null;
    return JSON.parse(row.resultJson) as T;
  } catch {
    return null;
  }
}

/** Returns existing result, 'busy', or 'claimed' (this request owns the key). */
export async function claimIdempotency(
  tenantId: string,
  key: string | null | undefined,
): Promise<{ state: 'skip' } | { state: 'busy' } | { state: 'done'; result: unknown } | { state: 'claimed' }> {
  const k = norm(key);
  if (!k) return { state: 'skip' };
  try {
    const existing = await readIdempotency<unknown>(tenantId, k);
    if (isCompletedIdempotencyResult(existing)) return { state: 'done', result: existing };
    if (existing && typeof existing === 'object' && (existing as { pending?: boolean }).pending) {
      return { state: 'busy' };
    }
    await db().insert(opsIdempotency).values({
      tenantId,
      key: k,
      resultJson: JSON.stringify({ pending: true }),
    });
    return { state: 'claimed' };
  } catch {
    const again = await readIdempotency<unknown>(tenantId, k);
    if (isCompletedIdempotencyResult(again)) return { state: 'done', result: again };
    return { state: 'busy' };
  }
}

export async function writeIdempotency(tenantId: string, key: string | null | undefined, result: unknown): Promise<void> {
  const k = norm(key);
  if (!k) return;
  try {
    await db()
      .update(opsIdempotency)
      .set({ resultJson: JSON.stringify(result) })
      .where(and(eq(opsIdempotency.tenantId, tenantId), eq(opsIdempotency.key, k)));
  } catch {
    /* ignore */
  }
}
