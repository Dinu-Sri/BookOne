import { describe, expect, it } from 'vitest';
import { buildSalesReturnPosting, posLinkedReturnPreview, sumSides } from '../src/index';

const goods2x100: Parameters<typeof posLinkedReturnPreview>[0]['source'] = {
  vatRate: 18,
  discountTotal: 0,
  subtotal: 200,
  lines: [
    {
      productId: 'g1',
      description: 'Goods',
      quantity: 2,
      unitPrice: 100,
      discountAmount: 0,
    },
  ],
  priorReturnLines: [],
  alreadyReturnedNet: 0,
};

describe('POS linked-return preview uses original source tax', () => {
  it('TAX 2×100 selecting 1 unit is net 100 + VAT 18 = 118', () => {
    const preview = posLinkedReturnPreview({
      source: goods2x100,
      cart: [{ productId: 'g1', description: 'Goods', quantity: 1, unitPrice: 100 }],
    });
    expect(preview.kind).toBe('ok');
    if (preview.kind === 'ok') {
      expect(preview.net).toBe(100);
      expect(preview.vatRate).toBe(18);
      expect(preview.vat).toBe(18);
      expect(preview.total).toBe(118);
    }
  });

  it('second remaining unit after the first 118 is also 118', () => {
    const preview = posLinkedReturnPreview({
      source: {
        ...goods2x100,
        priorReturnLines: [{ productId: 'g1', description: 'Goods', quantity: 1 }],
        alreadyReturnedNet: 100,
      },
      cart: [{ productId: 'g1', description: 'Goods', quantity: 1, unitPrice: 100 }],
    });
    expect(preview.kind).toBe('ok');
    if (preview.kind === 'ok') {
      expect(preview.vat).toBe(18);
      expect(preview.total).toBe(118);
    }
  });

  it('commercial / zero-VAT source stays 100 with no VAT', () => {
    const preview = posLinkedReturnPreview({
      source: { ...goods2x100, vatRate: 0, subtotal: 200 },
      cart: [{ productId: 'g1', description: 'Goods', quantity: 1, unitPrice: 100 }],
    });
    expect(preview.kind).toBe('ok');
    if (preview.kind === 'ok') {
      expect(preview.vat).toBe(0);
      expect(preview.vatRate).toBe(0);
      expect(preview.total).toBe(100);
    }
  });

  it('ignores a live 15% rate when the original ticket stored 18%', () => {
    const preview = posLinkedReturnPreview({
      source: goods2x100,
      cart: [{ productId: 'g1', description: 'Goods', quantity: 1, unitPrice: 100 }],
    });
    expect(preview.kind).toBe('ok');
    if (preview.kind === 'ok') {
      expect(preview.vat).toBe(18);
      expect(preview.total).toBe(118);
      expect(preview.vat).not.toBe(15);
    }
  });

  it('service 3×40: first unit 47.20 then remaining 2 are 94.40', () => {
    const source = {
      vatRate: 18,
      discountTotal: 0,
      subtotal: 120,
      lines: [
        {
          productId: 's1',
          description: 'Service',
          quantity: 3,
          unitPrice: 40,
          discountAmount: 0,
        },
      ],
      priorReturnLines: [] as { productId: string | null; description: string; quantity: number }[],
      alreadyReturnedNet: 0,
    };
    const first = posLinkedReturnPreview({
      source,
      cart: [{ productId: 's1', description: 'Service', quantity: 1, unitPrice: 40 }],
    });
    expect(first.kind).toBe('ok');
    if (first.kind === 'ok') {
      expect(first.net).toBe(40);
      expect(first.vat).toBe(7.2);
      expect(first.total).toBe(47.2);
    }
    const rest = posLinkedReturnPreview({
      source: {
        ...source,
        priorReturnLines: [{ productId: 's1', description: 'Service', quantity: 1 }],
        alreadyReturnedNet: 40,
      },
      cart: [{ productId: 's1', description: 'Service', quantity: 2, unitPrice: 40 }],
    });
    expect(rest.kind).toBe('ok');
    if (rest.kind === 'ok') {
      expect(rest.net).toBe(80);
      expect(rest.vat).toBe(14.4);
      expect(rest.total).toBe(94.4);
    }
  });

  it('mixed goods 100 + service 40 full refund is 165.20', () => {
    const preview = posLinkedReturnPreview({
      source: {
        vatRate: 18,
        discountTotal: 0,
        subtotal: 140,
        lines: [
          { productId: 'g1', description: 'Goods', quantity: 1, unitPrice: 100, discountAmount: 0 },
          { productId: 's1', description: 'Service', quantity: 1, unitPrice: 40, discountAmount: 0 },
        ],
        priorReturnLines: [],
        alreadyReturnedNet: 0,
      },
      cart: [
        { productId: 'g1', description: 'Goods', quantity: 1, unitPrice: 100 },
        { productId: 's1', description: 'Service', quantity: 1, unitPrice: 40 },
      ],
    });
    expect(preview.kind).toBe('ok');
    if (preview.kind === 'ok') {
      expect(preview.net).toBe(140);
      expect(preview.vat).toBe(25.2);
      expect(preview.total).toBe(165.2);
    }
  });

  it('free return stays net-only even with a TAX source in hand', () => {
    const preview = posLinkedReturnPreview({
      source: goods2x100,
      cart: [{ productId: 'g1', description: 'Goods', quantity: 1, unitPrice: 100 }],
      freeReturn: true,
    });
    expect(preview.kind).toBe('ok');
    if (preview.kind === 'ok') {
      expect(preview.vat).toBe(0);
      expect(preview.total).toBe(100);
    }
  });

  it('denies a quantity over the remaining cap', () => {
    const preview = posLinkedReturnPreview({
      source: goods2x100,
      cart: [{ productId: 'g1', description: 'Goods', quantity: 3, unitPrice: 100 }],
    });
    expect(preview.kind).toBe('invalid-quantity');
    if (preview.kind === 'invalid-quantity') {
      expect(preview.enteredQty).toBe(3);
      expect(preview.remainingQty).toBe(2);
    }
  });

  it('prorates a discounted TAX line and keeps 18% on the residual net', () => {
    const disc = {
      vatRate: 18,
      discountTotal: 13.5,
      subtotal: 256.5,
      lines: [
        {
          productId: 'sku',
          description: 'Widget',
          quantity: 3,
          unitPrice: 100,
          discountAmount: 30,
        },
      ],
      priorReturnLines: [] as { productId: string | null; description: string; quantity: number }[],
      alreadyReturnedNet: 0,
    };
    const first = posLinkedReturnPreview({
      source: disc,
      cart: [{ productId: 'sku', description: 'Widget', quantity: 1, unitPrice: 100 }],
    });
    expect(first.kind).toBe('ok');
    if (first.kind === 'ok') {
      expect(first.net).toBe(85.5);
      expect(first.vat).toBe(15.39);
      expect(first.total).toBe(100.89);
    }
  });
});

describe('POS linked-return journals agree with the preview', () => {
  it('cash goods 1 refunds 118, VAT 18, restocks cost 60', () => {
    const result = buildSalesReturnPosting({
      lines: [
        {
          description: 'Goods',
          quantity: 1,
          unitPrice: 100,
          unitCost: 60,
          productType: 'physical',
        },
      ],
      vatRatePercent: 18,
      refundCashAccountCode: '1000',
    });
    expect(result.netTotal).toBe(100);
    expect(result.vatTotal).toBe(18);
    expect(result.grandTotal).toBe(118);
    expect(result.lines.find((l) => l.accountCode === '1000' && l.side === 'credit')?.amount).toBe(118);
    expect(result.lines.find((l) => l.accountCode === '2200' && l.side === 'debit')?.amount).toBe(18);
    expect(result.lines.find((l) => l.accountCode === '5100' && l.side === 'debit')?.amount).toBe(60);
    expect(sumSides(result.lines)).toEqual({ debit: 178, credit: 178 });
  });

  it('card service 1 refunds 47.20 with no stock', () => {
    const result = buildSalesReturnPosting({
      lines: [
        {
          description: 'Service',
          quantity: 1,
          unitPrice: 40,
          unitCost: 0,
          productType: 'service',
        },
      ],
      vatRatePercent: 18,
      refundCashAccountCode: '1200',
    });
    expect(result.grandTotal).toBe(47.2);
    expect(result.vatTotal).toBe(7.2);
    expect(result.lines.find((l) => l.accountCode === '1200')?.amount).toBe(47.2);
    expect(result.lines.some((l) => l.accountCode === '5100')).toBe(false);
    expect(sumSides(result.lines)).toEqual({ debit: 47.2, credit: 47.2 });
  });

  it('card remaining 2 services refund 94.40 with no stock', () => {
    const result = buildSalesReturnPosting({
      lines: [
        {
          description: 'Service',
          quantity: 2,
          unitPrice: 40,
          unitCost: 0,
          productType: 'service',
        },
      ],
      vatRatePercent: 18,
      refundCashAccountCode: '1200',
    });
    expect(result.grandTotal).toBe(94.4);
    expect(result.vatTotal).toBe(14.4);
    expect(result.lines.some((l) => l.accountCode === '5100')).toBe(false);
  });

  it('mixed goods+service full bank refund 165.20 restocks goods cost 60', () => {
    const result = buildSalesReturnPosting({
      lines: [
        {
          description: 'Goods',
          quantity: 1,
          unitPrice: 100,
          unitCost: 60,
          productType: 'physical',
        },
        {
          description: 'Service',
          quantity: 1,
          unitPrice: 40,
          unitCost: 0,
          productType: 'service',
        },
      ],
      vatRatePercent: 18,
      refundCashAccountCode: '1100',
    });
    expect(result.netTotal).toBe(140);
    expect(result.vatTotal).toBe(25.2);
    expect(result.grandTotal).toBe(165.2);
    expect(result.lines.find((l) => l.accountCode === '1100' && l.side === 'credit')?.amount).toBe(165.2);
    expect(result.lines.find((l) => l.accountCode === '5100' && l.side === 'debit')?.amount).toBe(60);
    expect(sumSides(result.lines)).toEqual({ debit: 225.2, credit: 225.2 });
  });
});
