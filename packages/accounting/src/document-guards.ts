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
  const next = new Map<string, number>();
  addQtyMaps(next, thisLines);
  for (const [k, qty] of next) {
    const srcQty = src.get(k) ?? 0;
    const prior = already.get(k) ?? 0;
    if (qty + prior > srcQty + 0.0001) return true;
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

/**
 * Remaining quantity on each source line after prior returns of the same key.
 * Prior quantity is allocated across source lines in order so duplicate SKUs
 * do not all show the full leftover pool.
 */
export function remainingReturnQuantities(
  sourceLines: QtyLine[],
  priorReturnLines: QtyLine[],
): number[] {
  const priorLeft = new Map<string, number>();
  addQtyMaps(priorLeft, priorReturnLines);
  return sourceLines.map((s) => {
    const k = documentLineKey(s.productId, s.description);
    const used = priorLeft.get(k) ?? 0;
    const srcQty = Number(s.quantity);
    const take = Math.min(srcQty, used);
    priorLeft.set(k, remainingQty(used, take));
    return remainingQty(srcQty, take);
  });
}

export function linkedReturnPrefillQuantities(
  sourceLines: QtyLine[],
  priorReturnLines: QtyLine[],
): { sourceQuantity: number; remainingQuantity: number }[] {
  const remaining = remainingReturnQuantities(sourceLines, priorReturnLines);
  return sourceLines.map((s, i) => ({
    sourceQuantity: Number(s.quantity),
    remainingQuantity: remaining[i] ?? 0,
  }));
}

/** Visible purchase-return entry from a posted bill (qty form, not a one-click full post). */
export function purchaseReturnFromBillPath(sourceId: string): string {
  const id = String(sourceId ?? '').trim();
  if (!id) return '/purchase/returns/new';
  return `/purchase/returns/new?from=${encodeURIComponent(id)}`;
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

/**
 * Last remaining quantity takes leftover source *net* so cents are conserved.
 * When remaining net is below computed line net, keep enough header to close.
 * When remaining net is above computed line net (prior units over-allocated header),
 * lift line net to remaining and clear header. Never invent a surcharge.
 */
export function applyClosingReturnResidual(
  computedTotal: number,
  computedHeader: number,
  sourceTotal: number,
  priorReturnTotal: number,
  closing: boolean,
): { total: number; headerDiscount: number; lineNet: number } {
  const lineNet = Math.round((Number(computedTotal) + Number(computedHeader)) * 100) / 100;
  if (!closing) {
    return {
      total: Math.round(Number(computedTotal) * 100) / 100,
      headerDiscount: Math.round(Number(computedHeader) * 100) / 100,
      lineNet,
    };
  }
  const remaining = remainingReturnValue(sourceTotal, priorReturnTotal);
  if (remaining >= lineNet) {
    return { total: remaining, headerDiscount: 0, lineNet: remaining };
  }
  const headerDiscount = Math.max(0, Math.round((lineNet - remaining) * 100) / 100);
  return { total: remaining, headerDiscount, lineNet };
}

/** Preview totals: lifted line net, conserved header, optional source VAT on net. */
export function linkedReturnPreviewTotals(
  computedTotal: number,
  computedHeader: number,
  sourceNet: number,
  priorReturnNet: number,
  closing: boolean,
  vatRatePercent = 0,
): { subtotal: number; headerDiscount: number; net: number; vat: number; total: number } {
  const residual = applyClosingReturnResidual(
    computedTotal,
    computedHeader,
    sourceNet,
    priorReturnNet,
    closing,
  );
  const vat =
    vatRatePercent > 0
      ? Math.round(((residual.total * vatRatePercent) / 100) * 100) / 100
      : 0;
  return {
    subtotal: residual.lineNet,
    headerDiscount: residual.headerDiscount,
    net: residual.total,
    vat,
    total: Math.round((residual.total + vat) * 100) / 100,
  };
}

/** Header still available after prior returns, estimated from prior net vs qty-ratio line net. */
export function remainingLinkedHeaderDiscount(
  sourceHeader: number,
  sourceLineNet: number,
  sourceQty: number,
  priorQty: number,
  priorReturnNet: number,
): number {
  const header = Math.round(Number(sourceHeader) * 100) / 100;
  if (sourceQty <= 0) return Math.max(0, header);
  const priorLineNetEst = Math.round((sourceLineNet * (priorQty / sourceQty)) * 100) / 100;
  const priorHeaderTaken = Math.max(
    0,
    Math.round((priorLineNetEst - Number(priorReturnNet)) * 100) / 100,
  );
  return Math.max(0, Math.round((header - priorHeaderTaken) * 100) / 100);
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

export function matchLinkedReturnSourceLine(
  productId: string | null | undefined,
  description: string,
  sourceLines: ProrateSourceLine[],
): ProrateSourceLine | null {
  if (!sourceLines.length) return null;
  const pid = productId || null;
  if (pid) {
    const byId = sourceLines.find((s) => s.productId === pid);
    if (byId) return byId;
  }
  const k = documentLineKey(pid, description);
  return sourceLines.find((s) => documentLineKey(s.productId, s.description) === k) ?? null;
}

/**
 * Extra catalog rows on a linked return take the source unit price and lock,
 * not the current catalog sell/cost. Unmatched catalog items stay catalog-priced.
 */
export function linkedReturnAddedLineFromSource(
  productId: string | null | undefined,
  description: string,
  catalogUnitPrice: number,
  sourceLines: ProrateSourceLine[],
): {
  unitPrice: number;
  locked: boolean;
  discountType: 'percent' | 'fixed';
  discountValue: string;
  sourceQuantity?: string;
  sourceDiscountAmount?: string;
} {
  const src = matchLinkedReturnSourceLine(productId, description, sourceLines);
  if (!src) {
    return {
      unitPrice: catalogUnitPrice,
      locked: false,
      discountType: 'percent',
      discountValue: '',
    };
  }
  return {
    unitPrice: src.unitPrice,
    locked: true,
    discountType: src.discountAmount > 0 ? 'fixed' : 'percent',
    discountValue: src.discountAmount > 0 ? String(src.discountAmount) : '',
    sourceQuantity: String(src.quantity),
    sourceDiscountAmount: String(src.discountAmount ?? 0),
  };
}

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
  /** Sum of prior return *net* (stored subtotal / supply ex VAT). */
  priorReturnTotal?: number;
  /** Source *net* (stored subtotal / supply ex VAT). */
  sourceTotal?: number;
};

type SourceQtyPool = {
  remainingQty: number;
  unitPrice: number;
  unitCost: number;
  discountAmount: number;
  sourceQty: number;
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
  allocationAdjustment: number;
} {
  const pool = new Map<string, SourceQtyPool>();
  for (const s of sourceLines) {
    const k = documentLineKey(s.productId, s.description);
    const existing = pool.get(k);
    if (existing) {
      existing.remainingQty += Number(s.quantity);
      existing.sourceQty += Number(s.quantity);
      existing.discountAmount += Number(s.discountAmount);
    } else {
      pool.set(k, {
        remainingQty: Number(s.quantity),
        unitPrice: Number(s.unitPrice),
        unitCost: Number(s.unitCost) || 0,
        discountAmount: Number(s.discountAmount),
        sourceQty: Number(s.quantity),
      });
    }
  }
  for (const p of prior?.priorReturnLines ?? []) {
    const k = documentLineKey(p.productId, p.description);
    const src = pool.get(k);
    if (src) src.remainingQty = remainingQty(src.remainingQty, Number(p.quantity));
  }

  const lines = returnLines.map((line) => {
    const k = documentLineKey(line.productId, line.description);
    const src = pool.get(k);
    if (!src || src.remainingQty <= 0.0001) {
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
    src.remainingQty = remainingQty(src.remainingQty, line.quantity);
    const discountAmount = prorateSourceDiscount(src.discountAmount, src.sourceQty, line.quantity);
    const gross = Math.round(line.quantity * src.unitPrice * 100) / 100;
    const lineTotal = Math.max(0, Math.round((gross - discountAmount) * 100) / 100);
    return {
      productId: line.productId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: src.unitPrice,
      unitCost: src.unitCost,
      discountAmount,
      lineTotal,
    };
  });
  const srcLineNet = sourceLines.reduce(
    (s, l) => s + Number(l.quantity) * Number(l.unitPrice) - Number(l.discountAmount),
    0,
  );
  let lineNet = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  let headerDiscount = prorateSourceHeader(sourceHeaderDiscount, srcLineNet, lineNet);
  if (prior) {
    const sourceQty = sourceLines.reduce((s, l) => s + Number(l.quantity), 0);
    const priorQty = (prior.priorReturnLines ?? []).reduce((s, l) => s + Number(l.quantity), 0);
    const budget = remainingLinkedHeaderDiscount(
      sourceHeaderDiscount,
      srcLineNet,
      sourceQty,
      priorQty,
      prior.priorReturnTotal ?? 0,
    );
    headerDiscount = Math.min(headerDiscount, budget);
  }
  let total = Math.max(0, Math.round((lineNet - headerDiscount) * 100) / 100);
  let allocationAdjustment = 0;
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
    lineNet = residual.lineNet;
    const persistable = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    allocationAdjustment = Math.round((lineNet - persistable) * 100) / 100;
    if (allocationAdjustment !== 0) {
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line || Number(line.quantity) <= 0) continue;
        line.lineTotal = Math.round((line.lineTotal + allocationAdjustment) * 100) / 100;
        break;
      }
    }
  }
  return { lines, headerDiscount, lineNet, total, allocationAdjustment };
}

/**
 * Shared sales/purchase preview and posting totals for a linked return.
 * Remaining-header cap and closing residual run in prorateLinkedReturn.
 */
export function linkedReturnDocumentTotals(
  sourceLines: ProrateSourceLine[],
  sourceHeaderDiscount: number,
  returnLines: ProrateReturnLine[],
  prior: LinkedReturnPrior | undefined,
  vatRatePercent = 0,
): {
  subtotal: number;
  headerDiscount: number;
  net: number;
  vat: number;
  total: number;
  allocationAdjustment: number;
} {
  const out = prorateLinkedReturn(sourceLines, sourceHeaderDiscount, returnLines, prior);
  const vat =
    vatRatePercent > 0
      ? Math.round(((out.total * vatRatePercent) / 100) * 100) / 100
      : 0;
  return {
    subtotal: out.lineNet,
    headerDiscount: out.headerDiscount,
    net: out.total,
    vat,
    total: Math.round((out.total + vat) * 100) / 100,
    allocationAdjustment: out.allocationAdjustment,
  };
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
export const PERCENT_HEADER_DISCOUNT_OVER_100_MESSAGE =
  'Percentage header discount cannot exceed 100%.';
export const HEADER_DISCOUNT_EXCEEDS_NET_MESSAGE =
  'Header discount cannot exceed the document total after line discounts.';
export const SAVED_DISCOUNT_EXCEEDS_NET_MESSAGE =
  'Saved discount cannot exceed the document total after line discounts.';

export type ManualHeaderDiscountInput = {
  lineNet: number;
  /** Legacy amount-only callers. Used when raw type/value are absent. */
  headerDiscountAmount?: number;
  headerDiscountType?: 'percent' | 'fixed' | null;
  headerDiscountValue?: number | null;
  savedDiscount?: { discountType: string; value: number } | null;
  /** Linked source-derived header; when set, manual/saved raw fields are ignored. */
  linkedSourceHeader?: number | null;
};

export type ManualHeaderDiscountResult =
  | { ok: true; amount: number; source: 'linked' | 'saved' | 'raw' | 'amount' }
  | { ok: false; error: string };

/**
 * Validate raw header type/value when provided, then independently check the
 * resulting money amount. Amount-only callers cannot submit more than line-net.
 * Linked source headers are never replaced by client hidden fields.
 */
export function resolveManualHeaderDiscount(input: ManualHeaderDiscountInput): ManualHeaderDiscountResult {
  const lineNet = Math.max(0, Math.round(Number(input.lineNet) * 100) / 100);
  if (input.linkedSourceHeader != null && Number.isFinite(Number(input.linkedSourceHeader))) {
    const amount = Math.max(0, Math.round(Number(input.linkedSourceHeader) * 100) / 100);
    if (amount > lineNet + 0.005) return { ok: false, error: HEADER_DISCOUNT_EXCEEDS_NET_MESSAGE };
    return { ok: true, amount, source: 'linked' };
  }
  if (input.savedDiscount) {
    const t = String(input.savedDiscount.discountType);
    const v = Number(input.savedDiscount.value);
    if (t === 'percent' && v > 100 + 0.0001) {
      return { ok: false, error: PERCENT_HEADER_DISCOUNT_OVER_100_MESSAGE };
    }
    const amount =
      t === 'percent' ? Math.round(((lineNet * v) / 100) * 100) / 100 : Math.round(v * 100) / 100;
    if (amount > lineNet + 0.005) return { ok: false, error: SAVED_DISCOUNT_EXCEEDS_NET_MESSAGE };
    return { ok: true, amount: Math.max(0, amount), source: 'saved' };
  }
  const rawType = input.headerDiscountType;
  const rawValue = input.headerDiscountValue;
  const hasRaw =
    (rawType === 'percent' || rawType === 'fixed') &&
    rawValue != null &&
    Number.isFinite(Number(rawValue));
  if (hasRaw) {
    const v = Number(rawValue);
    if (rawType === 'percent' && v > 100 + 0.0001) {
      return { ok: false, error: PERCENT_HEADER_DISCOUNT_OVER_100_MESSAGE };
    }
    const amount =
      rawType === 'percent' ? Math.round(((lineNet * v) / 100) * 100) / 100 : Math.round(v * 100) / 100;
    if (amount > lineNet + 0.005) return { ok: false, error: HEADER_DISCOUNT_EXCEEDS_NET_MESSAGE };
    return { ok: true, amount: Math.max(0, amount), source: 'raw' };
  }
  const amount = Math.max(0, Math.round(Number(input.headerDiscountAmount ?? 0) * 100) / 100);
  if (amount > lineNet + 0.005) return { ok: false, error: HEADER_DISCOUNT_EXCEEDS_NET_MESSAGE };
  return { ok: true, amount, source: 'amount' };
}

export function creditPrintTitle(documentType: string): string | null {
  if (documentType === 'sales_return') return 'CREDIT NOTE';
  if (documentType === 'purchase_return') return 'PURCHASE CREDIT NOTE';
  return null;
}

export function isCreditPrintDocument(documentType: string): boolean {
  return creditPrintTitle(documentType) != null;
}
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
export const PAYMENT_OVER_BALANCE_EPSILON = 0.005;

export function parsePaymentAmount(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  return Number(String(raw ?? '').replace(/[^0-9.-]/g, '')) || 0;
}

export function paymentAmountExceedsBalance(
  amount: number,
  balanceDue: number,
  epsilon = PAYMENT_OVER_BALANCE_EPSILON,
): boolean {
  return amount > balanceDue + epsilon;
}

/** Field-level over-balance copy. Empty/zero selected rows are not over-allocation. */
export function paymentAllocationFieldError(
  amountRaw: string,
  balanceDue: number,
  selected: boolean,
): string | null {
  if (!selected) return null;
  const amount = parsePaymentAmount(amountRaw);
  if (amount <= 0) return null;
  if (paymentAmountExceedsBalance(amount, balanceDue)) return PAYMENT_OVER_BALANCE_MESSAGE;
  return null;
}

export function paymentAllocationsHaveOverBalance(
  rows: { selected: boolean; amountRaw: string; balanceDue: number }[],
): boolean {
  return rows.some((row) => paymentAllocationFieldError(row.amountRaw, row.balanceDue, row.selected) != null);
}

function sumLineQty(lines: { quantity: number }[]): number {
  return lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
}

export type LinkedReturnPreviewDisplay =
  | {
      kind: 'invalid-quantity';
      enteredQty: number;
      remainingQty: number;
    }
  | {
      kind: 'ok';
      subtotal: number;
      headerDiscount: number;
      net: number;
      vat: number;
      total: number;
      allocationAdjustment: number;
    };

/**
 * Preview for a linked return. Invalid quantity is a distinct state so the UI
 * does not present a source header discount that merely caps an over-qty total.
 */
export function linkedReturnPreviewDisplay(
  sourceLines: ProrateSourceLine[],
  sourceHeaderDiscount: number,
  returnLines: ProrateReturnLine[],
  prior: LinkedReturnPrior | undefined,
  vatRatePercent = 0,
): LinkedReturnPreviewDisplay {
  const sourceQty: QtyLine[] = sourceLines.map((l) => ({
    productId: l.productId,
    description: l.description,
    quantity: l.quantity,
  }));
  const priorQty = prior?.priorReturnLines ?? [];
  if (returnQtyExceeded(sourceQty, priorQty, returnLines)) {
    const already = new Map<string, number>();
    addQtyMaps(already, priorQty);
    const src = new Map<string, number>();
    addQtyMaps(src, sourceQty);
    let remaining = 0;
    for (const [k, qty] of src) {
      remaining += remainingQty(qty, already.get(k) ?? 0);
    }
    return {
      kind: 'invalid-quantity',
      enteredQty: Math.round(sumLineQty(returnLines) * 10000) / 10000,
      remainingQty: Math.round(remaining * 10000) / 10000,
    };
  }
  const totals = linkedReturnDocumentTotals(
    sourceLines,
    sourceHeaderDiscount,
    returnLines,
    prior,
    vatRatePercent,
  );
  return { kind: 'ok', ...totals };
}

export type PersistedBreakdownLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
};

export type PersistedDocumentBreakdown = {
  lines: {
    description: string;
    quantity: number;
    unitPrice: number;
    gross: number;
    discount: number;
    net: number;
    allocationAdjustment: number;
  }[];
  lineNet: number;
  headerDiscount: number;
  supplyNet: number;
  tax: number;
  credit: number;
  allocationAdjustment: number;
};

/**
 * Permission-checked View numbers from persisted rows. Stored subtotal is
 * after-header supply (supplyNet), not the before-header line-net.
 */
export function persistedDocumentBreakdown(
  lines: PersistedBreakdownLine[],
  storedSubtotal: number,
  headerDiscount: number,
  taxTotal: number,
  total: number,
): PersistedDocumentBreakdown {
  const mapped = lines.map((l) => {
    const gross = Math.round(Number(l.quantity) * Number(l.unitPrice) * 100) / 100;
    const discount = Math.round(Number(l.discountAmount) * 100) / 100;
    const net = Math.round(Number(l.lineTotal) * 100) / 100;
    const allocationAdjustment = Math.round((net - Math.max(0, gross - discount)) * 100) / 100;
    return {
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      gross,
      discount,
      net,
      allocationAdjustment,
    };
  });
  const lineNet = Math.round(mapped.reduce((s, l) => s + l.net, 0) * 100) / 100;
  const allocationAdjustment =
    Math.round(mapped.reduce((s, l) => s + l.allocationAdjustment, 0) * 100) / 100;
  return {
    lines: mapped,
    lineNet,
    headerDiscount: Math.round(Number(headerDiscount) * 100) / 100,
    supplyNet: Math.round(Number(storedSubtotal) * 100) / 100,
    tax: Math.round(Number(taxTotal) * 100) / 100,
    credit: Math.round(Number(total) * 100) / 100,
    allocationAdjustment,
  };
}

export type HydrateDraftLineInput = {
  id: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  discountPercent?: number;
  sku?: string | null;
  productClass?: string | null;
};

export type HydratedDraftLineState = {
  key: string;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  sku?: string;
  isManual: boolean;
  discountType: 'percent' | 'fixed';
  discountValue: string;
  productClass?: string;
};

/** Restore SKU, product class and line discount so a draft reopens at saved totals. */
export function hydrateDraftLineState(line: HydrateDraftLineInput): HydratedDraftLineState {
  const percent = Number(line.discountPercent ?? 0);
  const amount = Number(line.discountAmount ?? 0);
  const discountType: 'percent' | 'fixed' = percent > 0 ? 'percent' : amount > 0 ? 'fixed' : 'percent';
  const discountValue =
    discountType === 'percent' ? (percent > 0 ? String(percent) : '') : String(amount);
  return {
    key: line.id,
    productId: line.productId ?? '',
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: String(line.unitPrice),
    sku: line.sku || undefined,
    isManual: !line.productId,
    discountType,
    discountValue,
    productClass: line.productClass || undefined,
  };
}

export function invoiceDraftDisplayedTotals(
  lines: LineDiscountInput[],
  headerDiscount: number,
): { lineNet: number; headerDiscount: number; total: number } {
  const lineNet =
    Math.round(
      lines.reduce((s, l) => {
        const qty = moneyNum(l.quantity);
        const price = moneyNum(l.unitPrice);
        const gross = Math.round(qty * price * 100) / 100;
        return s + Math.max(0, Math.round((gross - lineDiscountAmount(l)) * 100) / 100);
      }, 0) * 100,
    ) / 100;
  const header = Math.min(Math.max(0, Math.round(Number(headerDiscount) * 100) / 100), lineNet);
  return { lineNet, headerDiscount: header, total: Math.round((lineNet - header) * 100) / 100 };
}

export function conversionTargetNeedsSupplierInvoice(targetType: string): boolean {
  return targetType === 'purchase' || targetType === 'vendor_bill' || targetType === 'import_purchase';
}

/** Bills take the entered supplier number only. Source PO/GRN references are not inherited. */
export function conversionBillSupplierInvoiceNumber(
  targetType: string,
  entered: string | null | undefined,
): string | undefined {
  if (!conversionTargetNeedsSupplierInvoice(targetType)) return undefined;
  const v = String(entered ?? '').trim();
  return v || undefined;
}

export type LinkedReturnPickerSource = {
  id: string;
  documentNumber: string;
  partyName: string;
  headerDiscount: number;
  sourceNet: number;
  alreadyReturnedNet: number;
  lines: Array<{
    id?: string;
    productId: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    discountPercent?: number;
    sku?: string | null;
    productClass?: string | null;
  }>;
  priorReturnLines: QtyLine[];
};

export type LinkedReturnPickerFormState = {
  sourceDocumentId: string | null;
  sourceDocumentNumber: string | null;
  partyName: string | null;
  headerDiscount: number;
  remainingQuantity: number;
  remainingValue: number;
  lines: Array<{
    productId: string;
    description: string;
    quantity: string;
    unitPrice: string;
    sourceQuantity: string;
    sourceDiscountAmount: string;
    discountType: 'percent' | 'fixed';
    discountValue: string;
    sku?: string;
    productClass?: string;
  }>;
};

export function emptyLinkedReturnPickerFormState(): LinkedReturnPickerFormState {
  return {
    sourceDocumentId: null,
    sourceDocumentNumber: null,
    partyName: null,
    headerDiscount: 0,
    remainingQuantity: 0,
    remainingValue: 0,
    lines: [],
  };
}

/** Client bill-picker navigation must replace all source-backed form state, not keep empty first-mount lines. */
export function linkedReturnPickerFormStateFromSource(
  source: LinkedReturnPickerSource | null,
): LinkedReturnPickerFormState {
  if (!source) return emptyLinkedReturnPickerFormState();
  const sourceQtyLines = source.lines.map((l) => ({
    productId: l.productId,
    description: l.description,
    quantity: Number(l.quantity),
  }));
  const prefill = linkedReturnPrefillQuantities(sourceQtyLines, source.priorReturnLines);
  return {
    sourceDocumentId: source.id,
    sourceDocumentNumber: source.documentNumber,
    partyName: source.partyName,
    headerDiscount: source.headerDiscount,
    remainingQuantity: prefill.reduce((s, p) => s + p.remainingQuantity, 0),
    remainingValue: remainingReturnValue(source.sourceNet, source.alreadyReturnedNet),
    lines: source.lines.map((l, i) => {
      const remaining = prefill[i]?.remainingQuantity ?? 0;
      const hydrated = hydrateDraftLineState({
        id: l.id ?? `src-${i}`,
        productId: l.productId,
        description: l.description,
        quantity: remaining,
        unitPrice: l.unitPrice,
        discountAmount: l.discountAmount,
        discountPercent: l.discountPercent,
        sku: l.sku,
        productClass: l.productClass,
      });
      return {
        productId: hydrated.productId,
        description: hydrated.description,
        quantity: hydrated.quantity,
        unitPrice: hydrated.unitPrice,
        sourceQuantity: String(l.quantity),
        sourceDiscountAmount: String(l.discountAmount ?? 0),
        discountType: hydrated.discountType,
        discountValue: hydrated.discountValue,
        sku: hydrated.sku,
        productClass: hydrated.productClass,
      };
    }),
  };
}

/** Simulate empty→A, A→B, and clear/reselect without keeping the previous bill's lines. */
export function applyLinkedReturnPickerSelection(
  _current: LinkedReturnPickerFormState,
  nextSource: LinkedReturnPickerSource | null,
): LinkedReturnPickerFormState {
  return linkedReturnPickerFormStateFromSource(nextSource);
}
