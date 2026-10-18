import { describe, expect, it } from 'vitest';
import { isCompletedIdempotencyResult } from '../../../apps/web/src/lib/idempotency-result';
import {
  claimIdempotencyWithStore,
  concludeCommercialIdempotency,
  releaseIdempotencyWithStore,
  writeIdempotencyWithStore,
  type IdempotencyStore,
} from '../../../apps/web/src/lib/idempotency-lifecycle';

class MemoryStore implements IdempotencyStore {
  rows = new Map<string, unknown>();
  failNextInsert = false;

  private id(tenantId: string, key: string) {
    return `${tenantId}:${key}`;
  }

  async get(tenantId: string, key: string) {
    return this.rows.has(this.id(tenantId, key)) ? this.rows.get(this.id(tenantId, key))! : null;
  }

  async insertPending(tenantId: string, key: string) {
    const id = this.id(tenantId, key);
    if (this.failNextInsert) {
      this.failNextInsert = false;
      throw new Error('unique_violation');
    }
    if (this.rows.has(id)) throw new Error('unique_violation');
    this.rows.set(id, { pending: true });
  }

  async update(tenantId: string, key: string, result: unknown) {
    this.rows.set(this.id(tenantId, key), result);
  }

  async delete(tenantId: string, key: string) {
    this.rows.delete(this.id(tenantId, key));
  }
}

const tenant = '11111111-1111-1111-1111-111111111111';
const key = 'idem-key-service-bill-10';

describe('commercial rejected-attempt idempotency lifecycle', () => {
  it('releases a conclusive supplier-number refusal so the corrected reference posts once', async () => {
    const store = new MemoryStore();
    expect(await claimIdempotencyWithStore(store, tenant, key)).toEqual({ state: 'claimed' });
    await concludeCommercialIdempotency(store, tenant, key, { outcome: 'conclusive-failure' });
    expect(await store.get(tenant, key)).toBeNull();

    expect(await claimIdempotencyWithStore(store, tenant, key)).toEqual({ state: 'claimed' });
    await concludeCommercialIdempotency(store, tenant, key, {
      outcome: 'success',
      id: 'bill-10',
    });
    const replay = await claimIdempotencyWithStore(store, tenant, key);
    expect(replay).toEqual({ state: 'done', result: { ok: true, id: 'bill-10' } });
  });

  it('releases stock, dimension and rollback refusals the same way', async () => {
    for (const label of ['stock', 'dimensions', 'rollback']) {
      const store = new MemoryStore();
      const k = `idem-key-${label}-retry`;
      expect(await claimIdempotencyWithStore(store, tenant, k)).toEqual({ state: 'claimed' });
      await concludeCommercialIdempotency(store, tenant, k, { outcome: 'conclusive-failure' });
      expect(await claimIdempotencyWithStore(store, tenant, k)).toEqual({ state: 'claimed' });
    }
  });

  it('keeps a concurrent in-flight claim busy until the owner finishes', async () => {
    const store = new MemoryStore();
    expect(await claimIdempotencyWithStore(store, tenant, key)).toEqual({ state: 'claimed' });
    expect(await claimIdempotencyWithStore(store, tenant, key)).toEqual({ state: 'busy' });
    store.failNextInsert = true;
    expect(await claimIdempotencyWithStore(store, tenant, key)).toEqual({ state: 'busy' });
  });

  it('replays a committed success when the response was lost', async () => {
    const store = new MemoryStore();
    expect(await claimIdempotencyWithStore(store, tenant, key)).toEqual({ state: 'claimed' });
    await concludeCommercialIdempotency(store, tenant, key, {
      outcome: 'uncertain-commit',
      id: 'posted-once',
    });
    const replay = await claimIdempotencyWithStore(store, tenant, key);
    expect(replay.state).toBe('done');
    if (replay.state === 'done') {
      expect(replay.result).toEqual({ ok: true, id: 'posted-once' });
    }
  });

  it('does not treat a permanently cached error as correction recovery', async () => {
    const store = new MemoryStore();
    await writeIdempotencyWithStore(store, tenant, key, { ok: false, error: 'Supplier invoice number is required (Purchase settings).' });
    expect(isCompletedIdempotencyResult({ ok: false, error: 'x' })).toBe(true);
    const claim = await claimIdempotencyWithStore(store, tenant, key);
    expect(claim.state).toBe('done');
    expect(await claimIdempotencyWithStore(store, tenant, key)).toEqual(claim);
  });

  it('never deletes a completed success on release', async () => {
    const store = new MemoryStore();
    expect(await claimIdempotencyWithStore(store, tenant, key)).toEqual({ state: 'claimed' });
    await writeIdempotencyWithStore(store, tenant, key, { ok: true, id: 'keep-me' });
    await releaseIdempotencyWithStore(store, tenant, key);
    expect(await store.get(tenant, key)).toEqual({ ok: true, id: 'keep-me' });
  });

  it('skips keys shorter than 8 characters', async () => {
    const store = new MemoryStore();
    expect(await claimIdempotencyWithStore(store, tenant, 'short')).toEqual({ state: 'skip' });
  });
});
