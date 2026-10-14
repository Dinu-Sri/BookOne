import { describe, expect, it } from 'vitest';
import { isCompletedIdempotencyResult } from '../../../apps/web/src/lib/idempotency-result';

describe('idempotency completed result (BUG-0023)', () => {
  it('treats paidCount/ok payloads without id as done', () => {
    expect(isCompletedIdempotencyResult({ ok: true, paidCount: 1 })).toBe(true);
    expect(isCompletedIdempotencyResult({ ok: false, error: 'busy later', paidCount: 0 })).toBe(true);
    expect(isCompletedIdempotencyResult({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })).toBe(true);
  });

  it('keeps in-flight claims busy', () => {
    expect(isCompletedIdempotencyResult({ pending: true })).toBe(false);
    expect(isCompletedIdempotencyResult({ pending: true, ok: true, paidCount: 1 })).toBe(false);
    expect(isCompletedIdempotencyResult(null)).toBe(false);
    expect(isCompletedIdempotencyResult({})).toBe(false);
  });
});
