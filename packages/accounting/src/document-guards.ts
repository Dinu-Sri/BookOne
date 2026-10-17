/**
 * Pure remaining-qty, discount, and as-of helpers for commercial documents.
 * Independent of Next.js / DB so the expected examples can be unit-tested.
 */

export function documentLineKey(productId: string | null | undefined, description: string): string {
  return `${productId ?? ''}|${description.trim().toLowerCase()}`;
}

export const PURCHASE_BILL_TYPES = ['purchase', 'import_purchase', 'vendor_bill', 'cash_purchase'] as const;

export type QtyLine = {
  productId: string | null;
  description: string;
  quantity: number;
};

export type LinkedChildDoc = {
  id: string;
  documentType: string;
  sourceDocumentId: string | null;
  lines: QtyLine[];
};

export function addQtyMaps(into: Map<string, number>, lines: QtyLine[]): void {
  for (const line of lines) {
    const k = documentLineKey(line.productId, line.description);
    into.set(k, (into.get(k) ?? 0) + Number(line.quantity));
  }
}

/** Bills of the PO plus bills whose source is a GRN of the PO. */
export function billedQtyAgainstPo(poId: string, children: LinkedChildDoc[]): Map<string, number> {
  const grnIds = new Set(
    children
      .filter((c) => c.documentType === 'goods_receipt' && c.sourceDocumentId === poId)
      .map((c) => c.id),
  );
  const map = new Map<string, number>();
  for (const child of children) {
    const isBill = (PURCHASE_BILL_TYPES as readonly string[]).includes(child.documentType);
    if (!isBill) continue;
    const fromPo = child.sourceDocumentId === poId;
    const fromGrn = Boolean(child.sourceDocumentId && grnIds.has(child.sourceDocumentId));
    if (!fromPo && !fromGrn) continue;
    addQtyMaps(map, child.lines);
  }
  return map;
}

export function receivedQtyAgainstPo(poId: string, children: LinkedChildDoc[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const child of children) {
    if (child.documentType !== 'goods_receipt' || child.sourceDocumentId !== poId) continue;
    addQtyMaps(map, child.lines);
  }
  return map;
}

export function remainingQty(ordered: number, used: number): number {
  return Math.max(0, Math.round((ordered - used) * 10000) / 10000);
}

export function qtyExceedsRemaining(thisQty: number, remaining: number): boolean {
  return thisQty > remaining + 0.0001;
}

export function returnQtyExceeded(
  sourceLines: QtyLine[],
  priorReturnLines: QtyLine[],
  thisLines: QtyLine[],
): boolean {
  const already = new Map<string, number>();
  addQtyMaps(already, priorReturnLines);
  const src = new Map<string, number>();
  addQtyMaps(src, sourceLines);
  for (const line of thisLines) {
    const k = documentLineKey(line.productId, line.description);
    const srcQty = src.get(k) ?? 0;
    const prior = already.get(k) ?? 0;
    if (line.quantity + prior > srcQty + 0.0001) return true;
  }
  return false;
}

export function returnValueExceeded(
  sourceTotal: number,
  priorReturnTotal: number,
  thisTotal: number,
): boolean {
  return thisTotal + priorReturnTotal > sourceTotal + 0.005;
}

export function remainingReturnValue(sourceTotal: number, priorReturnTotal: number): number {
  return Math.round(Math.max(0, Number(sourceTotal) - Number(priorReturnTotal)) * 100) / 100;
}

/** True when this return consumes every remaining source line quantity. */
export function isClosingLinkedReturn(
  sourceLines: QtyLine[],
  priorReturnLines: QtyLine[],
  thisLines: QtyLine[],
): boolean {
  const already = new Map<string, number>();
  addQtyMaps(already, priorReturnLines);
  const src = new Map<string, number>();
  addQtyMaps(src, sourceLines);
  const next = new Map<string, number>();
  addQtyMaps(next, thisLines);
  if (src.size === 0) return false;
  for (const [k, srcQty] of src) {
    const used = (already.get(k) ?? 0) + (next.get(k) ?? 0);
    if (remainingQty(srcQty, used) > 0.0001) return false;
  }
  return true;
}

/** Last remaining quantity takes leftover source value so cents are conserved. */
export function applyClosingReturnResidual(
  computedTotal: number,
  computedHeader: number,
  sourceTotal: number,
  priorReturnTotal: number,
  closing: boolean,
): { total: number; headerDiscount: number } {
  if (!closing) {
    return {
      total: Math.round(Number(computedTotal) * 100) / 100,
      headerDiscount: Math.round(Number(computedHeader) * 100) / 100,
    };
  }
  const remaining = remainingReturnValue(sourceTotal, priorReturnTotal);
  const lineNet = Math.round((Number(computedTotal) + Number(computedHeader)) * 100) / 100;
  const headerDiscount = Math.max(0, Math.round((lineNet - remaining) * 100) / 100);
  return { total: remaining, headerDiscount };
}

export function linkedReturnPartyMismatch(sourcePartyName: string, submittedPartyName: string): boolean {
  const source = String(sourcePartyName ?? '').trim().toLowerCase();
  const submitted = String(submittedPartyName ?? '').trim().toLowerCase();
  if (!source || !submitted) return false;
  return source !== submitted;
}

export function issuedOnOrBeforeAsOf<T extends { issueDate: string }>(items: T[], asOf: string): T[] {
  return items.filter((item) => item.issueDate <= asOf);
}

/**
 * Reconstruct open AR/AP at a cutoff: current due plus settlements dated after as-of.
 * Payments/credits on the cutoff date have already reduced current due and stay applied.
 */
export function asOfOpenBalance(currentBalanceDue: number, laterSettlements: number): number {
  return Math.round(Math.max(0, currentBalanceDue + laterSettlements) * 100) / 100;
}

/** Stored subtotal is after header discount. Display line-net as stored + header. */
export function displayedLineNetSubtotal(storedSubtotal: number, headerDiscount: number): number {
  return Math.round((Number(storedSubtotal) + Number(headerDiscount)) * 100) / 100;
}

export type ProrateSourceLine = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost?: number;
  discountAmount: number;
};

export type ProrateReturnLine = {
  productId: string | null;
  description: string;
  quantity: number;
};

export function prorateSourceDiscount(
  sourceDiscount: number,
  sourceQty: number,
  thisQty: number,
): number {
  if (sourceQty <= 0) return 0;
  return Math.round(sourceDiscount * (thisQty / sourceQty) * 100) / 100;
}

export function prorateSourceHeader(
  sourceHeader: number,
  sourceLineNet: number,
  returnLineNet: number,
): number {
  if (sourceHeader <= 0 || sourceLineNet <= 0) return 0;
  return Math.round(sourceHeader * (returnLineNet / sourceLineNet) * 100) / 100;
}

export type LinkedReturnPrior = {
  priorReturnLines?: QtyLine[];
  priorReturnTotal?: number;
  sourceTotal?: number;
};

/** Source-proportional line/header discounts for a linked return (shared by posting and preview). */
export function prorateLinkedReturn(
  sourceLines: ProrateSourceLine[],
  sourceHeaderDiscount: number,
  returnLines: ProrateReturnLine[],
  prior?: LinkedReturnPrior,
): {
  lines: {
    productId: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    discountAmount: number;
    lineTotal: number;
  }[];
  headerDiscount: number;
  lineNet: number;
  total: number;
} {
  const used = new Set<number>();
  const lines = returnLines.map((line) => {
    const idx = sourceLines.findIndex((s, i) => {
      if (used.has(i)) return false;
      return documentLineKey(s.productId, s.description) === documentLineKey(line.productId, line.description);
    });
    if (idx < 0) {
      return {
        productId: line.productId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: 0,
        unitCost: 0,
        discountAmount: 0,
        lineTotal: 0,
      };
    }
    used.add(idx);
    const src = sourceLines[idx]!;
    const discountAmount = prorateSourceDiscount(src.discountAmount, src.quantity, line.quantity);
    const gross = Math.round(line.quantity * src.unitPrice * 100) / 100;
    const lineTotal = Math.max(0, Math.round((gross - discountAmount) * 100) / 100);
    return {
      productId: line.productId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: src.unitPrice,
      unitCost: Number(src.unitCost) || 0,
      discountAmount,
      lineTotal,
    };
  });
  const srcLineNet = sourceLines.reduce(
    (s, l) => s + Number(l.quantity) * Number(l.unitPrice) - Number(l.discountAmount),
    0,
  );
  const lineNet = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  let headerDiscount = prorateSourceHeader(sourceHeaderDiscount, srcLineNet, lineNet);
  let total = Math.max(0, Math.round((lineNet - headerDiscount) * 100) / 100);
  if (prior) {
    const sourceTotal =
      prior.sourceTotal ?? Math.round((srcLineNet - sourceHeaderDiscount) * 100) / 100;
    const closing = isClosingLinkedReturn(
      sourceLines.map((l) => ({
        productId: l.productId,
        description: l.description,
        quantity: l.quantity,
      })),
      prior.priorReturnLines ?? [],
      returnLines,
    );
    const residual = applyClosingReturnResidual(
      total,
      headerDiscount,
      sourceTotal,
      prior.priorReturnTotal ?? 0,
      closing,
    );
    headerDiscount = residual.headerDiscount;
    total = residual.total;
  }
  return { lines, headerDiscount, lineNet, total };
}

export type LineDiscountInput = {
  quantity: string | number;
  unitPrice: string | number;
  discountType?: 'percent' | 'fixed' | null;
  discountValue?: string | number | null;
  sourceQuantity?: string | number | null;
  sourceDiscountAmount?: string | number | null;
};

function moneyNum(v: string | number | null | undefined): number {
  return Number(String(v ?? '0').replace(/[^0-9.-]/g, '')) || 0;
}

/** UI default is percent. Missing type is percent, matching the % select default. */
export function resolvedDiscountType(
  type: LineDiscountInput['discountType'],
): 'percent' | 'fixed' {
  return type === 'fixed' ? 'fixed' : 'percent';
}

export function lineDiscountAmount(line: LineDiscountInput): number {
  const qty = moneyNum(line.quantity);
  const price = moneyNum(line.unitPrice);
  const gross = Math.round(qty * price * 100) / 100;
  if (gross <= 0) return 0;
  if (line.sourceQuantity != null && line.sourceQuantity !== '' && line.sourceDiscountAmount != null) {
    const srcQty = moneyNum(line.sourceQuantity);
    if (srcQty > 0) {
      return Math.min(gross, prorateSourceDiscount(moneyNum(line.sourceDiscountAmount), srcQty, qty));
    }
  }
  const v = moneyNum(line.discountValue);
  if (v <= 0) return 0;
  if (resolvedDiscountType(line.discountType) === 'percent') {
    return Math.min(gross, Math.round(((gross * v) / 100) * 100) / 100);
  }
  return Math.min(gross, Math.round(v * 100) / 100);
}

export function percentDiscountOver100(
  discountType: LineDiscountInput['discountType'],
  discountValue: number,
): boolean {
  return resolvedDiscountType(discountType) === 'percent' && discountValue > 100 + 0.0001;
}

export const PERCENT_DISCOUNT_OVER_100_MESSAGE = 'Percentage line discount cannot exceed 100%.';
export const GRN_REMAINING_MESSAGE =
  'This receipt exceeds the remaining quantity on the purchase order.';
export const BILL_REMAINING_MESSAGE =
  'This bill exceeds the remaining quantity on the purchase order.';
export const GRN_BILL_REMAINING_MESSAGE =
  'This bill exceeds the remaining quantity on the goods receipt.';
export const SALES_RETURN_QTY_MESSAGE =
  'This return exceeds the remaining quantity on the original invoice.';
export const SALES_RETURN_VALUE_MESSAGE =
  'This return exceeds the remaining value on the original invoice.';
export const PURCHASE_RETURN_QTY_MESSAGE =
  'This return exceeds the remaining quantity on the original bill.';
export const PURCHASE_RETURN_VALUE_MESSAGE =
  'This return exceeds the remaining value on the original bill.';
export const SALES_RETURN_PARTY_MESSAGE =
  'This return must use the same customer as the original invoice.';
export const PURCHASE_RETURN_PARTY_MESSAGE =
  'This return must use the same supplier as the original bill.';
export const PAYMENT_OVER_BALANCE_MESSAGE = 'Payment cannot exceed balance due.';
