import { describe, expect, it } from 'vitest';
import {
  applyClosingReturnResidual,
  asOfOpenBalance,
  billedQtyAgainstPo,
  conversionBillSupplierInvoiceNumber,
  conversionTargetNeedsSupplierInvoice,
  displayedLineNetSubtotal,
  hydrateDraftLineState,
  invoiceDraftDisplayedTotals,
  isClosingLinkedReturn,
  issuedOnOrBeforeAsOf,
  lineDiscountAmount,
  linkedReturnDocumentTotals,
  linkedReturnPartyMismatch,
  linkedReturnPreviewDisplay,
  linkedReturnPreviewTotals,
  percentDiscountOver100,
  persistedDocumentBreakdown,
  prorateLinkedReturn,
  qtyExceedsRemaining,
  receivedQtyAgainstPo,
  remainingQty,
  remainingReturnValue,
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

describe('as-of open balance reconstructs later settlements', () => {
  it('16 Oct as-of keeps 181 after a 17 Oct receipt of 1 against current 180', () => {
    expect(asOfOpenBalance(180, 1)).toBe(181);
    expect(asOfOpenBalance(180, 1) + 70).toBe(251);
  });

  it('does not change current due when there are no later settlements', () => {
    expect(asOfOpenBalance(180, 0)).toBe(180);
  });

  it('includes a currently closed invoice that was paid after the cutoff', () => {
    expect(asOfOpenBalance(0, 181)).toBe(181);
  });
});

describe('linked return preview matches posting ratios', () => {
  const source = [
    {
      productId: 'sku',
      description: 'Widget',
      quantity: 3,
      unitPrice: 100,
      unitCost: 60,
      discountAmount: 30,
    },
  ];

  it('qty 1 of 3×100 with line 10% and header 13.50 is 85.50', () => {
    const out = prorateLinkedReturn(source, 13.5, [
      { productId: 'sku', description: 'Widget', quantity: 1 },
    ]);
    expect(out.lines[0]?.discountAmount).toBe(10);
    expect(out.lineNet).toBe(90);
    expect(out.headerDiscount).toBe(4.5);
    expect(out.total).toBe(85.5);
  });

  it('remaining qty 2 is 171', () => {
    const out = prorateLinkedReturn(source, 13.5, [
      { productId: 'sku', description: 'Widget', quantity: 2 },
    ]);
    expect(out.total).toBe(171);
  });

  it('full qty 3 is 256.50', () => {
    const out = prorateLinkedReturn(source, 13.5, [
      { productId: 'sku', description: 'Widget', quantity: 3 },
    ]);
    expect(out.total).toBe(256.5);
  });

  it('preview line discount follows source qty when the type is still fixed 30', () => {
    expect(
      lineDiscountAmount({
        quantity: 1,
        unitPrice: 100,
        discountType: 'fixed',
        discountValue: 30,
        sourceQuantity: 3,
        sourceDiscountAmount: 30,
      }),
    ).toBe(10);
  });
});

describe('displayed subtotal is line net before header discount', () => {
  it('256.50 stored after 13.50 header displays as 270', () => {
    expect(displayedLineNetSubtotal(256.5, 13.5)).toBe(270);
  });
});

describe('linked return party must match the source', () => {
  it('rejects a different supplier or customer name', () => {
    expect(linkedReturnPartyMismatch('D2513 Vendor', 'BW261016 Supplier')).toBe(true);
    expect(linkedReturnPartyMismatch('RoundingCustomer', 'ReturnCustomer')).toBe(true);
  });

  it('allows the original party including surrounding case/space', () => {
    expect(linkedReturnPartyMismatch('D2513 Vendor', 'D2513 Vendor')).toBe(false);
    expect(linkedReturnPartyMismatch('Alice', ' alice ')).toBe(false);
    expect(linkedReturnPartyMismatch('Alice', '')).toBe(false);
  });
});

describe('closing return residual conserves source value', () => {
  const sourceLines = [{ productId: 'sku', description: 'Digit', quantity: 3 }];
  const unit = [{ productId: 'sku', description: 'Digit', quantity: 1 }];

  it('3×1 header 0.01 remaining after 1+1 is 0.99', () => {
    expect(remainingReturnValue(2.99, 2)).toBe(0.99);
    expect(isClosingLinkedReturn(sourceLines, [...unit, ...unit], unit)).toBe(true);
    expect(isClosingLinkedReturn(sourceLines, unit, unit)).toBe(false);
  });

  it('last unit takes the leftover cent', () => {
    const residual = applyClosingReturnResidual(1, 0, 2.99, 2, true);
    expect(residual.total).toBe(0.99);
    expect(residual.headerDiscount).toBe(0.01);
  });

  it('non-closing units keep the prorated total', () => {
    expect(applyClosingReturnResidual(1, 0, 2.99, 1, false)).toEqual({
      total: 1,
      headerDiscount: 0,
      lineNet: 1,
    });
  });

  it('full qty 3 still posts 2.99', () => {
    const out = prorateLinkedReturn(
      [{ productId: 'sku', description: 'Digit', quantity: 3, unitPrice: 1, discountAmount: 0 }],
      0.01,
      [{ productId: 'sku', description: 'Digit', quantity: 3 }],
      { priorReturnTotal: 0, sourceTotal: 2.99, priorReturnLines: [] },
    );
    expect(out.total).toBe(2.99);
    expect(out.headerDiscount).toBe(0.01);
  });

  it('qty 1 after two accepted credits of 1 is 0.99', () => {
    const out = prorateLinkedReturn(
      [{ productId: 'sku', description: 'Digit', quantity: 3, unitPrice: 1, discountAmount: 0 }],
      0.01,
      [{ productId: 'sku', description: 'Digit', quantity: 1 }],
      {
        sourceTotal: 2.99,
        priorReturnTotal: 2,
        priorReturnLines: [
          { productId: 'sku', description: 'Digit', quantity: 1 },
          { productId: 'sku', description: 'Digit', quantity: 1 },
        ],
      },
    );
    expect(out.total).toBe(0.99);
  });
});

describe('linked return posting ignores an edited unit price', () => {
  it('qty 2 still credits 171 when the form price is 200', () => {
    const out = prorateLinkedReturn(
      [
        {
          productId: 'sku',
          description: 'Widget',
          quantity: 3,
          unitPrice: 100,
          unitCost: 60,
          discountAmount: 30,
        },
      ],
      13.5,
      [{ productId: 'sku', description: 'Widget', quantity: 2 }],
    );
    expect(out.lines[0]?.unitPrice).toBe(100);
    expect(out.total).toBe(171);
  });
});

describe('closing residual conserves 7×1 header 0.05 = 6.95', () => {
  const source = [
    { productId: 'sku', description: 'Digit', quantity: 7, unitPrice: 1, discountAmount: 0 },
  ];
  const unit = { productId: 'sku', description: 'Digit', quantity: 1 };
  const six = Array.from({ length: 6 }, () => unit);
  const five = Array.from({ length: 5 }, () => unit);

  it('last unit after six 0.99 credits previews and posts 1.01', () => {
    expect(remainingReturnValue(6.95, 5.94)).toBe(1.01);
    const residual = applyClosingReturnResidual(1, 0, 6.95, 5.94, true);
    expect(residual.total).toBe(1.01);
    expect(residual.headerDiscount).toBe(0);
    expect(residual.lineNet).toBe(1.01);
    const out = prorateLinkedReturn(source, 0.05, [unit], {
      sourceTotal: 6.95,
      priorReturnTotal: 5.94,
      priorReturnLines: six,
    });
    expect(out.total).toBe(1.01);
    expect(out.headerDiscount).toBe(0);
    expect(out.lineNet).toBe(1.01);
    expect(out.allocationAdjustment).toBe(0.01);
    expect(out.lines[0]?.unitPrice).toBe(1);
    expect(Math.round(out.lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100).toBe(1.01);
    expect(out.lineNet - out.headerDiscount).toBe(out.total);
    const preview = linkedReturnPreviewTotals(1, 0, 6.95, 5.94, true);
    expect(preview).toEqual({
      subtotal: 1.01,
      headerDiscount: 0,
      net: 1.01,
      vat: 0,
      total: 1.01,
    });
  });

  it('non-closing unit 6 after five 0.99 credits does not over-allocate header', () => {
    const out = prorateLinkedReturn(source, 0.05, [unit], {
      sourceTotal: 6.95,
      priorReturnTotal: 4.95,
      priorReturnLines: five,
    });
    expect(out.headerDiscount).toBe(0);
    expect(out.total).toBe(1);
  });
});

describe('duplicate return rows aggregate quantity', () => {
  const source = [{ productId: 'sku', description: 'Widget', quantity: 3 }];
  const priced = [
    { productId: 'sku', description: 'Widget', quantity: 3, unitPrice: 100, discountAmount: 0 },
  ];

  it('refuses two rows of 2 against 3 sold', () => {
    expect(
      returnQtyExceeded(source, [], [
        { productId: 'sku', description: 'Widget', quantity: 2 },
        { productId: 'sku', description: 'Widget', quantity: 2 },
      ]),
    ).toBe(true);
  });

  it('allows split rows 1+1 of 3', () => {
    expect(
      returnQtyExceeded(source, [], [
        { productId: 'sku', description: 'Widget', quantity: 1 },
        { productId: 'sku', description: 'Widget', quantity: 1 },
      ]),
    ).toBe(false);
  });

  it('split 1+1 keeps source unit price 100 on both rows', () => {
    const out = prorateLinkedReturn(priced, 0, [
      { productId: 'sku', description: 'Widget', quantity: 1 },
      { productId: 'sku', description: 'Widget', quantity: 1 },
    ]);
    expect(out.lines[0]?.unitPrice).toBe(100);
    expect(out.lines[1]?.unitPrice).toBe(100);
    expect(out.total).toBe(200);
  });
});

describe('discounted taxable full return keeps net, header and gross', () => {
  const source = [
    {
      productId: 'sku',
      description: 'Widget',
      quantity: 3,
      unitPrice: 100,
      discountAmount: 30,
    },
  ];

  it('full return residual stays in net space: header 13.50, net 256.50, gross 302.67', () => {
    const out = prorateLinkedReturn(source, 13.5, [
      { productId: 'sku', description: 'Widget', quantity: 3 },
    ], {
      sourceTotal: 256.5,
      priorReturnTotal: 0,
      priorReturnLines: [],
    });
    expect(out.headerDiscount).toBe(13.5);
    expect(out.lineNet).toBe(270);
    expect(out.total).toBe(256.5);
    const preview = linkedReturnPreviewTotals(256.5, 13.5, 256.5, 0, true, 18);
    expect(preview.subtotal).toBe(270);
    expect(preview.headerDiscount).toBe(13.5);
    expect(preview.net).toBe(256.5);
    expect(preview.vat).toBe(46.17);
    expect(preview.total).toBe(302.67);
    expect(returnValueExceeded(302.67, 0, 302.67)).toBe(false);
  });

  it('no-header tax 100 + 18% is 118', () => {
    const out = prorateLinkedReturn(
      [{ productId: 'sku', description: 'Item', quantity: 1, unitPrice: 100, discountAmount: 0 }],
      0,
      [{ productId: 'sku', description: 'Item', quantity: 1 }],
      { sourceTotal: 100, priorReturnTotal: 0, priorReturnLines: [] },
    );
    expect(out.total).toBe(100);
    expect(out.headerDiscount).toBe(0);
    const preview = linkedReturnPreviewTotals(100, 0, 100, 0, true, 18);
    expect(preview.vat).toBe(18);
    expect(preview.total).toBe(118);
    expect(returnValueExceeded(118, 0, 118)).toBe(false);
  });
});

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function lineSum(lines: { lineTotal: number }[]) {
  return money(lines.reduce((s, l) => s + l.lineTotal, 0));
}

function ladderStep(sourceQty: number, header: number, priorCount: number, priorTotal: number) {
  const source = [
    { productId: 'sku', description: 'Digit', quantity: sourceQty, unitPrice: 1, discountAmount: 0 },
  ];
  const unit = { productId: 'sku', description: 'Digit', quantity: 1 };
  const prior = {
    sourceTotal: money(sourceQty - header),
    priorReturnTotal: priorTotal,
    priorReturnLines: Array.from({ length: priorCount }, () => unit),
  };
  const posting = prorateLinkedReturn(source, header, [unit], prior);
  const preview = linkedReturnDocumentTotals(source, header, [unit], prior);
  return { posting, preview };
}

describe('fresh capped-header ladders preview equals posting', () => {
  it('seven units: 0.99×5 then 1.00×2, conserved 6.95', () => {
    const expected = [0.99, 0.99, 0.99, 0.99, 0.99, 1, 1];
    let priorTotal = 0;
    for (let i = 0; i < expected.length; i++) {
      const { posting, preview } = ladderStep(7, 0.05, i, priorTotal);
      expect(posting.total).toBe(expected[i]);
      expect(preview.net).toBe(expected[i]);
      expect(preview.total).toBe(expected[i]);
      expect(lineSum(posting.lines) - posting.headerDiscount).toBe(posting.total);
      priorTotal = money(priorTotal + posting.total);
    }
    expect(priorTotal).toBe(6.95);
  });

  it('ten units: 0.99×5 then 1.00×5, conserved 9.95', () => {
    const expected = [0.99, 0.99, 0.99, 0.99, 0.99, 1, 1, 1, 1, 1];
    let priorTotal = 0;
    for (let i = 0; i < expected.length; i++) {
      const { posting, preview } = ladderStep(10, 0.05, i, priorTotal);
      expect(posting.total).toBe(expected[i]);
      expect(preview.net).toBe(expected[i]);
      expect(lineSum(posting.lines) - posting.headerDiscount).toBe(posting.total);
      priorTotal = money(priorTotal + posting.total);
    }
    expect(priorTotal).toBe(9.95);
  });

  it('three-unit 2.99 control: 1.00, 1.00, 0.99', () => {
    const expected = [1, 1, 0.99];
    let priorTotal = 0;
    for (let i = 0; i < expected.length; i++) {
      const { posting, preview } = ladderStep(3, 0.01, i, priorTotal);
      expect(posting.total).toBe(expected[i]);
      expect(preview.net).toBe(expected[i]);
      expect(lineSum(posting.lines) - posting.headerDiscount).toBe(posting.total);
      priorTotal = money(priorTotal + posting.total);
    }
    expect(priorTotal).toBe(2.99);
  });
});

describe('legacy residual represents allocation on the last line', () => {
  it('six 0.99 credits against 6.95 close at 1.01 with line sum 1.01', () => {
    const source = [
      { productId: 'sku', description: 'Digit', quantity: 7, unitPrice: 1, discountAmount: 0 },
    ];
    const unit = { productId: 'sku', description: 'Digit', quantity: 1 };
    const out = prorateLinkedReturn(source, 0.05, [unit], {
      sourceTotal: 6.95,
      priorReturnTotal: 5.94,
      priorReturnLines: Array.from({ length: 6 }, () => unit),
    });
    expect(out.total).toBe(1.01);
    expect(out.allocationAdjustment).toBe(0.01);
    expect(out.headerDiscount).toBe(0);
    expect(out.lines[0]?.unitPrice).toBe(1);
    expect(lineSum(out.lines)).toBe(1.01);
    expect(lineSum(out.lines) - out.headerDiscount).toBe(out.total);
  });

  it('nine 0.99 credits against 9.95 close at 1.04 with line sum 1.04', () => {
    const source = [
      { productId: 'sku', description: 'Digit', quantity: 10, unitPrice: 1, discountAmount: 0 },
    ];
    const unit = { productId: 'sku', description: 'Digit', quantity: 1 };
    const out = prorateLinkedReturn(source, 0.05, [unit], {
      sourceTotal: 9.95,
      priorReturnTotal: 8.91,
      priorReturnLines: Array.from({ length: 9 }, () => unit),
    });
    expect(out.total).toBe(1.04);
    expect(out.allocationAdjustment).toBe(0.04);
    expect(out.headerDiscount).toBe(0);
    expect(out.lines[0]?.unitPrice).toBe(1);
    expect(lineSum(out.lines)).toBe(1.04);
    expect(lineSum(out.lines) - out.headerDiscount).toBe(out.total);
  });
});

describe('invalid quantity preview is not a source discount cap', () => {
  const priced = [
    { productId: 'sku', description: 'Widget', quantity: 3, unitPrice: 100, discountAmount: 0 },
  ];

  it('2+2 against 3 is invalid-quantity, not discount 100 on 400', () => {
    const preview = linkedReturnPreviewDisplay(priced, 0, [
      { productId: 'sku', description: 'Widget', quantity: 2 },
      { productId: 'sku', description: 'Widget', quantity: 2 },
    ], { sourceTotal: 300, priorReturnTotal: 0, priorReturnLines: [] });
    expect(preview.kind).toBe('invalid-quantity');
    if (preview.kind === 'invalid-quantity') {
      expect(preview.enteredQty).toBe(4);
      expect(preview.remainingQty).toBe(3);
    }
  });

  it('valid 1+1+1 keeps source price 100 and total 300', () => {
    const preview = linkedReturnPreviewDisplay(priced, 0, [
      { productId: 'sku', description: 'Widget', quantity: 1 },
      { productId: 'sku', description: 'Widget', quantity: 1 },
      { productId: 'sku', description: 'Widget', quantity: 1 },
    ], { sourceTotal: 300, priorReturnTotal: 0, priorReturnLines: [] });
    expect(preview.kind).toBe('ok');
    if (preview.kind === 'ok') {
      expect(preview.headerDiscount).toBe(0);
      expect(preview.total).toBe(300);
    }
  });

  it('preserves 85.50 / 171 / 302.67 / 118', () => {
    const disc = [
      { productId: 'sku', description: 'Widget', quantity: 3, unitPrice: 100, discountAmount: 30 },
    ];
    const first = linkedReturnPreviewDisplay(disc, 13.5, [
      { productId: 'sku', description: 'Widget', quantity: 1 },
    ], { sourceTotal: 256.5, priorReturnTotal: 0, priorReturnLines: [] });
    expect(first.kind).toBe('ok');
    if (first.kind === 'ok') expect(first.net).toBe(85.5);
    const rest = linkedReturnPreviewDisplay(disc, 13.5, [
      { productId: 'sku', description: 'Widget', quantity: 2 },
    ], {
      sourceTotal: 256.5,
      priorReturnTotal: 85.5,
      priorReturnLines: [{ productId: 'sku', description: 'Widget', quantity: 1 }],
    });
    expect(rest.kind).toBe('ok');
    if (rest.kind === 'ok') expect(rest.net).toBe(171);
    const taxed = linkedReturnDocumentTotals(disc, 13.5, [
      { productId: 'sku', description: 'Widget', quantity: 3 },
    ], { sourceTotal: 256.5, priorReturnTotal: 0, priorReturnLines: [] }, 18);
    expect(taxed.total).toBe(302.67);
    const noHeader = linkedReturnPreviewDisplay(
      [{ productId: 'sku', description: 'Item', quantity: 1, unitPrice: 100, discountAmount: 0 }],
      0,
      [{ productId: 'sku', description: 'Item', quantity: 1 }],
      { sourceTotal: 100, priorReturnTotal: 0, priorReturnLines: [] },
      18,
    );
    expect(noHeader.kind).toBe('ok');
    if (noHeader.kind === 'ok') expect(noHeader.total).toBe(118);
  });
});

describe('draft hydration restores 256.50 economics', () => {
  it('saved 3×100 / 10% line / 5% header reopens at 256.50', () => {
    const hydrated = hydrateDraftLineState({
      id: 'line-1',
      productId: 'prod-1',
      description: 'Widget',
      quantity: 3,
      unitPrice: 100,
      discountPercent: 10,
      discountAmount: 30,
      sku: 'N14',
      productClass: 'digital',
    });
    expect(hydrated.sku).toBe('N14');
    expect(hydrated.productClass).toBe('digital');
    expect(hydrated.discountType).toBe('percent');
    expect(hydrated.discountValue).toBe('10');
    const totals = invoiceDraftDisplayedTotals(
      [
        {
          quantity: hydrated.quantity,
          unitPrice: hydrated.unitPrice,
          discountType: hydrated.discountType,
          discountValue: hydrated.discountValue,
        },
      ],
      13.5,
    );
    expect(totals.lineNet).toBe(270);
    expect(totals.headerDiscount).toBe(13.5);
    expect(totals.total).toBe(256.5);
  });

  it('amount-only persisted discount still totals 256.50', () => {
    const hydrated = hydrateDraftLineState({
      id: 'line-1',
      productId: 'prod-1',
      description: 'Widget',
      quantity: 3,
      unitPrice: 100,
      discountAmount: 30,
      sku: 'N14',
    });
    expect(hydrated.discountType).toBe('fixed');
    const totals = invoiceDraftDisplayedTotals(
      [
        {
          quantity: hydrated.quantity,
          unitPrice: hydrated.unitPrice,
          discountType: hydrated.discountType,
          discountValue: hydrated.discountValue,
        },
      ],
      13.5,
    );
    expect(totals.total).toBe(256.5);
  });
});

describe('persisted return breakdown', () => {
  it('shows line gross/discount/net, header, VAT and credit without relabelling stored subtotal', () => {
    const out = persistedDocumentBreakdown(
      [{ description: 'Widget', quantity: 3, unitPrice: 100, discountAmount: 30, lineTotal: 270 }],
      256.5,
      13.5,
      46.17,
      302.67,
    );
    expect(out.lines[0]?.gross).toBe(300);
    expect(out.lines[0]?.discount).toBe(30);
    expect(out.lines[0]?.net).toBe(270);
    expect(out.lineNet).toBe(270);
    expect(out.headerDiscount).toBe(13.5);
    expect(out.supplyNet).toBe(256.5);
    expect(displayedLineNetSubtotal(out.supplyNet, out.headerDiscount)).toBe(270);
    expect(out.tax).toBe(46.17);
    expect(out.credit).toBe(302.67);
    expect(out.allocationAdjustment).toBe(0);
  });

  it('exposes last-line allocationAdjustment on a 1.01 residual without changing stored credit', () => {
    const out = persistedDocumentBreakdown(
      [{ description: 'Digit', quantity: 1, unitPrice: 1, discountAmount: 0, lineTotal: 1.01 }],
      1.01,
      0,
      0,
      1.01,
    );
    expect(out.lines[0]?.allocationAdjustment).toBe(0.01);
    expect(out.allocationAdjustment).toBe(0.01);
    expect(out.credit).toBe(1.01);
    expect(out.lines[0]?.unitPrice).toBe(1);
  });
});

describe('conversion supplier invoice is entered, not inherited', () => {
  it('bill targets use the typed number and ignore a blank inherited source', () => {
    expect(conversionTargetNeedsSupplierInvoice('purchase')).toBe(true);
    expect(conversionBillSupplierInvoiceNumber('purchase', '  VENDOR-88  ')).toBe('VENDOR-88');
    expect(conversionBillSupplierInvoiceNumber('purchase', '')).toBeUndefined();
    expect(conversionBillSupplierInvoiceNumber('goods_receipt', 'PO-1')).toBeUndefined();
  });
});
