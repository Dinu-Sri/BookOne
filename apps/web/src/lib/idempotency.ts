import 'server-only';

import { and, db, eq, opsIdempotency } from '@bookone/db';
import {
  claimIdempotencyWithStore,
  concludeCommercialIdempotency,
  normIdempotencyKey,
  releaseIdempotencyWithStore,
  writeIdempotencyWithStore,
  type IdempotencyStore,
} from '@/lib/idempotency-lifecycle';

export { isCompletedIdempotencyResult } from '@/lib/idempotency-result';
export { concludeCommercialIdempotency } from '@/lib/idempotency-lifecycle';

function dbStore(): IdempotencyStore {
  return {
    async get(tenantId, key) {
      try {
        const [row] = await db()
          .select({ resultJson: opsIdempotency.resultJson })
          .from(opsIdempotency)
          .where(and(eq(opsIdempotency.tenantId, tenantId), eq(opsIdempotency.key, key)))
          .limit(1);
        if (!row?.resultJson) return null;
        return JSON.parse(row.resultJson) as unknown;
      } catch {
        return null;
      }
    },
    async insertPending(tenantId, key) {
      await db().insert(opsIdempotency).values({
        tenantId,
        key,
        resultJson: JSON.stringify({ pending: true }),
      });
    },
    async update(tenantId, key, result) {
      await db()
        .update(opsIdempotency)
        .set({ resultJson: JSON.stringify(result) })
        .where(and(eq(opsIdempotency.tenantId, tenantId), eq(opsIdempotency.key, key)));
    },
    async delete(tenantId, key) {
      await db()
        .delete(opsIdempotency)
        .where(and(eq(opsIdempotency.tenantId, tenantId), eq(opsIdempotency.key, key)));
    },
  };
}

export async function readIdempotency<T>(tenantId: string, key: string | null | undefined): Promise<T | null> {
  const k = normIdempotencyKey(key);
  if (!k) return null;
  return (await dbStore().get(tenantId, k)) as T | null;
}

/** Returns existing result, 'busy', or 'claimed' (this request owns the key). */
export async function claimIdempotency(
  tenantId: string,
  key: string | null | undefined,
): Promise<{ state: 'skip' } | { state: 'busy' } | { state: 'done'; result: unknown } | { state: 'claimed' }> {
  return claimIdempotencyWithStore(dbStore(), tenantId, key);
}

export async function writeIdempotency(tenantId: string, key: string | null | undefined, result: unknown): Promise<void> {
  await writeIdempotencyWithStore(dbStore(), tenantId, key, result);
}

export async function releaseIdempotency(tenantId: string, key: string | null | undefined): Promise<void> {
  await releaseIdempotencyWithStore(dbStore(), tenantId, key);
}

export async function concludeCommercialCreateClaim(
  tenantId: string,
  key: string | null | undefined,
  conclusion: { outcome: 'success'; id: string } | { outcome: 'conclusive-failure' } | { outcome: 'uncertain-commit'; id: string },
): Promise<void> {
  await concludeCommercialIdempotency(dbStore(), tenantId, key, conclusion);
}
