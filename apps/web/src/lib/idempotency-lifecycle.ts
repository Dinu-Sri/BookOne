import { isCompletedIdempotencyResult } from './idempotency-result';

export type IdempotencyStore = {
  get(tenantId: string, key: string): Promise<unknown | null>;
  insertPending(tenantId: string, key: string): Promise<void>;
  update(tenantId: string, key: string, result: unknown): Promise<void>;
  delete(tenantId: string, key: string): Promise<void>;
};

export type IdempotencyClaim =
  | { state: 'skip' }
  | { state: 'busy' }
  | { state: 'done'; result: unknown }
  | { state: 'claimed' };

export function normIdempotencyKey(key: string | null | undefined): string {
  const k = String(key ?? '').trim();
  return k.length >= 8 ? k.slice(0, 80) : '';
}

function isPendingResult(existing: unknown): boolean {
  return Boolean(existing && typeof existing === 'object' && (existing as { pending?: boolean }).pending === true);
}

export async function claimIdempotencyWithStore(
  store: IdempotencyStore,
  tenantId: string,
  key: string | null | undefined,
): Promise<IdempotencyClaim> {
  const k = normIdempotencyKey(key);
  if (!k) return { state: 'skip' };
  try {
    const existing = await store.get(tenantId, k);
    if (isCompletedIdempotencyResult(existing)) return { state: 'done', result: existing };
    if (isPendingResult(existing)) return { state: 'busy' };
    await store.insertPending(tenantId, k);
    return { state: 'claimed' };
  } catch {
    const again = await store.get(tenantId, k);
    if (isCompletedIdempotencyResult(again)) return { state: 'done', result: again };
    return { state: 'busy' };
  }
}

export async function writeIdempotencyWithStore(
  store: IdempotencyStore,
  tenantId: string,
  key: string | null | undefined,
  result: unknown,
): Promise<void> {
  const k = normIdempotencyKey(key);
  if (!k) return;
  try {
    await store.update(tenantId, k, result);
  } catch {
    /* ignore */
  }
}

/**
 * Drop an in-flight claim after a conclusive refusal or rollback so a corrected
 * retry with the same key can claim again. Completed success is never deleted.
 */
export async function releaseIdempotencyWithStore(
  store: IdempotencyStore,
  tenantId: string,
  key: string | null | undefined,
): Promise<void> {
  const k = normIdempotencyKey(key);
  if (!k) return;
  try {
    const existing = await store.get(tenantId, k);
    if (isCompletedIdempotencyResult(existing)) return;
    await store.delete(tenantId, k);
  } catch {
    /* ignore */
  }
}

export type CommercialIdempotencyConclusion =
  | { outcome: 'success'; id: string }
  | { outcome: 'conclusive-failure' }
  | { outcome: 'uncertain-commit'; id: string };

/**
 * Commercial create: write a replayable success after commit; release after a
 * known refusal/rollback. Never cache `{ok:false}` as the completed result.
 */
export async function concludeCommercialIdempotency(
  store: IdempotencyStore,
  tenantId: string,
  key: string | null | undefined,
  conclusion: CommercialIdempotencyConclusion,
): Promise<void> {
  if (conclusion.outcome === 'conclusive-failure') {
    await releaseIdempotencyWithStore(store, tenantId, key);
    return;
  }
  await writeIdempotencyWithStore(store, tenantId, key, { ok: true, id: conclusion.id });
}
