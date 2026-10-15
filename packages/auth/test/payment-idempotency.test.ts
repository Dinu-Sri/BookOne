import { describe, expect, it } from 'vitest';
import {
  paymentFingerprintConflicts,
  paymentOperationFingerprint,
} from '../../../apps/web/src/lib/payment-idempotency';
import { isCompletedIdempotencyResult } from '../../../apps/web/src/lib/idempotency-result';

describe('payment idempotency fingerprint (BUG-0032)', () => {
  const base = {
    paymentDate: '2026-10-14',
    paymentAccountCode: '1000',
    allocations: [{ documentId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', amount: 250 }],
  };

  it('matches equivalent replay and rejects a different invoice', () => {
    const fp = paymentOperationFingerprint(base);
    const other = paymentOperationFingerprint({
      ...base,
      allocations: [{ documentId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', amount: 250 }],
    });
    expect(fp).not.toBe(other);
    expect(paymentFingerprintConflicts({ ok: true, paidCount: 1, fingerprint: fp }, fp)).toBe(false);
    expect(paymentFingerprintConflicts({ ok: true, paidCount: 1, fingerprint: fp }, other)).toBe(true);
  });

  it('rejects completed results that have no fingerprint', () => {
    const fp = paymentOperationFingerprint(base);
    expect(paymentFingerprintConflicts({ ok: true, paidCount: 1 }, fp)).toBe(true);
    expect(isCompletedIdempotencyResult({ ok: true, paidCount: 1, fingerprint: fp })).toBe(true);
  });
});
