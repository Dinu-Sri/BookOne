/**
 * POS linked-return preview. Refund totals follow the original ticket's stored
 * tax profile, line prices, header discount and remaining caps. They do not
 * follow the current new-sale invoice kind or the live company VAT rate.
 * Free (unlinked) returns stay net-only in this helper.
 */

import {
  linkedReturnPreviewDisplay,
  type LinkedReturnPreviewDisplay,
  type ProrateSourceLine,
} from './document-guards';

export type PosLinkedReturnSource = {
  vatRate: number;
  discountTotal: number;
  subtotal: number;
  lines: {
    productId: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
    discountAmount?: number;
  }[];
  priorReturnLines: { productId: string | null; description: string; quantity: number }[];
  alreadyReturnedNet: number;
};

export type PosReturnCartLine = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
};

export type PosLinkedReturnPreview = LinkedReturnPreviewDisplay & { vatRate: number };

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function netOnlyCart(cart: PosReturnCartLine[]): PosLinkedReturnPreview {
  const subtotal = round2(cart.reduce((s, l) => s + round2(l.quantity * l.unitPrice), 0));
  return {
    kind: 'ok',
    subtotal,
    headerDiscount: 0,
    net: subtotal,
    vat: 0,
    vatRate: 0,
    total: subtotal,
    allocationAdjustment: 0,
  };
}

export function posLinkedReturnPreview(args: {
  source: PosLinkedReturnSource | null;
  cart: PosReturnCartLine[];
  freeReturn?: boolean;
}): PosLinkedReturnPreview {
  if (args.freeReturn || !args.source) return netOnlyCart(args.cart);

  const sourceLines: ProrateSourceLine[] = args.source.lines.map((l) => ({
    productId: l.productId,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountAmount: l.discountAmount ?? 0,
  }));
  const storedRate = Math.max(0, Number(args.source.vatRate) || 0);
  const preview = linkedReturnPreviewDisplay(
    sourceLines,
    Number(args.source.discountTotal) || 0,
    args.cart.map((l) => ({
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
    })),
    {
      sourceTotal: Number(args.source.subtotal) || 0,
      priorReturnTotal: Number(args.source.alreadyReturnedNet) || 0,
      priorReturnLines: args.source.priorReturnLines,
    },
    storedRate,
  );
  if (preview.kind === 'invalid-quantity') {
    return { ...preview, vatRate: storedRate };
  }
  return { ...preview, vatRate: preview.vat > 0 ? storedRate : 0 };
}
