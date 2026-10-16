import { describe, expect, it } from 'vitest';
import {
  billedQtyAgainstPo,
  issuedOnOrBeforeAsOf,
  lineDiscountAmount,
  percentDiscountOver100,
  qtyExceedsRemaining,
  receivedQtyAgainstPo,
  remainingQty,
  resolvedDiscountType,
  returnQtyExceeded,
  returnValueExceeded,
} from '../src/document-guards';

describe('PO billed qty walks GRN children', () => {
  const poId = 'po-1';
  const grnId = 'grn-1';
  const children = [
    {
      id: grnId,
      documentType: 'goods_receipt',
      sourceDocumentId: poId,
      lines: [{ productId: 'sku', description: 'Widget', quantity: 4 }],
    },
    {
      id: 'bill-from-grn',
      documentType: 'purchase',
      sourceDocumentId: grnId,
      lines: [{ productId: 'sku', description: 'Widget', quantity: 4 }],
    },
  ];

  it('counts a bill whose source is the GRN against the PO', () => {
    const billed = billedQtyAgainstPo(poId, children);
    expect(billed.get('sku|widget')).toBe(4);
    expect(remainingQty(10, billed.get('sku|widget') ?? 0)).toBe(6);
  });

  it('does not treat the GRN itself as billed', () => {
    const billed = billedQtyAgainstPo(poId, [
      {
        id: grnId,
        documentType: 'goods_receipt',
        sourceDocumentId: poId,
        lines: [{ productId: 'sku', description: 'Widget', quantity: 4 }],
      },
    ]);
    expect(billed.get('sku|widget') ?? 0).toBe(0);
    expect(remainingQty(10, 0)).toBe(10);
  });

  it('adds a direct PO bill to a GRN-sourced bill', () => {
    const billed = billedQtyAgainstPo(poId, [
      ...children,
      {
        id: 'direct-bill',
        documentType: 'purchase',
        sourceDocumentId: poId,
        lines: [{ productId: 'sku', description: 'Widget', quantity: 2 }],
      },
    ]);
    expect(billed.get('sku|widget')).toBe(6);
    expect(remainingQty(10, 6)).toBe(4);
  });
});

describe('PO remaining receive', () => {
  it('rejects a second GRN of 7 after 4 of 10', () => {
    const received = receivedQtyAgainstPo('po-1', [
      {
        id: 'grn-1',
        documentType: 'goods_receipt',
        sourceDocumentId: 'po-1',
        lines: [{ productId: 'sku', description: 'Widget', quantity: 4 }],
      },
    ]);
    const remaining = remainingQty(10, received.get('sku|widget') ?? 0);
    expect(remaining).toBe(6);
    expect(qtyExceedsRemaining(7, remaining)).toBe(true);
    expect(qtyExceedsRemaining(6, remaining)).toBe(false);
  });
});

describe('purchase return remaining', () => {
  const source = [{ productId: 'sku', description: 'Widget', quantity: 4 }];
  const firstReturn = [{ productId: 'sku', description: 'Widget', quantity: 4 }];

  it('rejects a second full return of the same 4 units', () => {
    expect(returnQtyExceeded(source, firstReturn, firstReturn)).toBe(true);
    expect(returnValueExceeded(240, 240, 240)).toBe(true);
  });

  it('allows a first full return', () => {
    expect(returnQtyExceeded(source, [], firstReturn)).toBe(false);
    expect(returnValueExceeded(240, 0, 240)).toBe(false);
  });
});

describe('line discount default percent', () => {
  it('treats missing type as percent: 3 × 100 with 10 is 30, not 10', () => {
    expect(
      lineDiscountAmount({ quantity: 3, unitPrice: 100, discountValue: 10 }),
    ).toBe(30);
    expect(resolvedDiscountType(undefined)).toBe('percent');
  });

  it('3 × 100 at 10% plus header 5% of 270 is 256.50', () => {
    const lineNet = 300 - lineDiscountAmount({
      quantity: 3,
      unitPrice: 100,
      discountType: 'percent',
      discountValue: 10,
    });
    expect(lineNet).toBe(270);
    const header = Math.round(((lineNet * 5) / 100) * 100) / 100;
    expect(header).toBe(13.5);
    expect(Math.round((lineNet - header) * 100) / 100).toBe(256.5);
  });

  it('fixed 10 on 3 × 100 is 10', () => {
    expect(
      lineDiscountAmount({
        quantity: 3,
        unitPrice: 100,
        discountType: 'fixed',
        discountValue: 10,
      }),
    ).toBe(10);
  });

  it('rejects percentage above 100 and does not treat 150 as a silent 100% cap', () => {
    expect(percentDiscountOver100('percent', 150)).toBe(true);
    expect(percentDiscountOver100('percent', 100)).toBe(false);
    expect(percentDiscountOver100('fixed', 150)).toBe(false);
  });
});

describe('as-of aging excludes later-issued documents', () => {
  it('as-of 15 Oct includes 14 Oct 690 and excludes 16 Oct 275.50', () => {
    const open = [
      { id: 'a', issueDate: '2026-10-14', balanceDue: 690 },
      { id: 'b', issueDate: '2026-10-16', balanceDue: 275.5 },
    ];
    const asOf = issuedOnOrBeforeAsOf(open, '2026-10-15');
    expect(asOf.map((r) => r.id)).toEqual(['a']);
    expect(asOf.reduce((s, r) => s + r.balanceDue, 0)).toBe(690);
  });
});
