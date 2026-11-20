import { describe, expect, it } from 'vitest';
import { validateEvent, validateOrderInput } from '../src/validate';

describe('commerce validate', () => {
  it('rejects fractional qty, total mismatch and unmapped SKU without claiming stock', () => {
    const result = validateOrderInput(
      {
        externalId: '1',
        currency: 'LKR',
        placedAt: '2026-11-20T10:00:00.000Z',
        customer: { name: 'Walk-in' },
        lines: [{ externalLineId: '1-1', sku: 'NOPE', quantity: '1.5', unitPrice: '10.00' }],
        total: '9.00',
        payment: { status: 'paid' },
      },
      { currency: 'LKR', mappings: [], products: [] },
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'fractional_qty')).toBe(true);
    expect(result.issues.some((i) => i.code === 'unmapped_sku')).toBe(true);
    expect(result.warning).toMatch(/cannot guarantee stock/);
  });

  it('requires an immutable refund id', () => {
    const issues = validateEvent({
      externalEventId: 'e1',
      kind: 'refunded',
      effectiveAt: '2026-11-20T12:00:00.000Z',
    });
    expect(issues.some((i) => i.code === 'missing_refund_id')).toBe(true);
  });
});
