import { CommerceError, httpStatusFor } from './errors';
import { almostEqual, parseMoney, parseQty } from './money';
import type { MappingRow, OrderEventInput, OrderInput, ProductRecord } from './types';

export type ValidationIssue = {
  code: string;
  message: string;
  field?: string;
  blocking: boolean;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
  lineTotal: string;
  computedTotal: string;
  mapped: Array<{ sku: string; productId: string | null; quantity: number; unitPrice: number }>;
  warning: string;
};

export function validateOrderInput(
  input: OrderInput,
  opts: {
    currency: string;
    mappings: MappingRow[];
    products: ProductRecord[];
  },
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const push = (code: string, message: string, field?: string, blocking = true) => {
    issues.push({ code, message, field, blocking });
  };

  if (!input.externalId?.trim()) push('missing_external_id', 'Store order ID is required.', 'externalId');
  if (input.currency !== opts.currency) {
    push('currency_mismatch', `Store currency ${input.currency} does not match the connection currency ${opts.currency}.`, 'currency');
  }
  if (!input.customer?.name?.trim()) push('missing_customer', 'Customer name is required.', 'customer.name');
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    push('missing_lines', 'At least one line is required.', 'lines');
  }

  let lineNet = 0;
  const mapped: ValidationResult['mapped'] = [];
  const seenLines = new Set<string>();
  for (const line of input.lines ?? []) {
    if (!line.externalLineId?.trim()) push('missing_line_id', 'Each line needs an immutable store line ID.', 'lines.externalLineId');
    else if (seenLines.has(line.externalLineId)) push('duplicate_line_id', `Line ${line.externalLineId} is duplicated.`, 'lines.externalLineId');
    else seenLines.add(line.externalLineId);
    let qty = 0;
    let price = 0;
    try {
      qty = parseQty(line.quantity, `Quantity for ${line.sku || 'line'}`);
    } catch (e) {
      push('fractional_qty', e instanceof Error ? e.message : 'Invalid quantity.', 'lines.quantity');
    }
    try {
      price = parseMoney(line.unitPrice, `Unit price for ${line.sku || 'line'}`);
    } catch (e) {
      push('invalid_price', e instanceof Error ? e.message : 'Invalid unit price.', 'lines.unitPrice');
    }
    const tax = line.taxAmount ? parseMoneySafe(line.taxAmount, 'tax', push) : 0;
    const discount = line.discountAmount ? parseMoneySafe(line.discountAmount, 'discount', push) : 0;
    lineNet += qty * price - discount + tax;
    const mapping = opts.mappings.find((m) => m.sku === line.sku || m.externalProductId === line.sku);
    const product = mapping
      ? opts.products.find((p) => p.id === mapping.bookoneProductId)
      : opts.products.find((p) => p.sku === line.sku);
    if (!product) {
      push('unmapped_sku', `SKU ${line.sku} is not mapped to a BookOne product.`, 'lines.sku');
      mapped.push({ sku: line.sku, productId: null, quantity: qty, unitPrice: price });
    } else if (product.archived || !product.isActive) {
      push('archived_sku', `SKU ${line.sku} is archived in BookOne.`, 'lines.sku');
      mapped.push({ sku: line.sku, productId: product.id, quantity: qty, unitPrice: price });
    } else {
      mapped.push({ sku: line.sku, productId: product.id, quantity: qty, unitPrice: price });
    }
  }

  const shipping = input.shippingAmount ? parseMoneySafe(input.shippingAmount, 'shipping', push) : 0;
  const orderDiscount = input.discountAmount ? parseMoneySafe(input.discountAmount, 'order discount', push) : 0;
  const orderTax = input.taxAmount ? parseMoneySafe(input.taxAmount, 'order tax', push) : 0;
  let stated = 0;
  try {
    stated = parseMoney(input.total, 'Order total');
  } catch (e) {
    push('invalid_total', e instanceof Error ? e.message : 'Invalid total.', 'total');
  }
  const computed = lineNet + shipping - orderDiscount + orderTax;
  if (stated && !almostEqual(stated, computed)) {
    push('total_mismatch', `Stated total ${stated.toFixed(2)} does not match computed ${computed.toFixed(2)}.`, 'total');
  }
  if (input.payment?.status === 'failed') {
    issues.push({
      code: 'payment_failed',
      message: 'Payment failed. The order is received for review and will not post.',
      field: 'payment.status',
      blocking: false,
    });
  }

  return {
    ok: issues.every((i) => !i.blocking),
    issues,
    lineTotal: lineNet.toFixed(2),
    computedTotal: computed.toFixed(2),
    mapped,
    warning: 'Preview cannot guarantee stock at checkout. BookOne remaining quantity is checked when the order is accepted.',
  };
}

function parseMoneySafe(value: string, label: string, push: (code: string, message: string, field?: string) => void): number {
  try {
    return parseMoney(value, label);
  } catch (e) {
    push('invalid_amount', e instanceof Error ? e.message : `Invalid ${label}.`, label);
    return 0;
  }
}

export function validateEvent(input: OrderEventInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!input.externalEventId?.trim()) issues.push({ code: 'missing_event_id', message: 'External event ID is required.', field: 'externalEventId', blocking: true });
  if (!['paid', 'cancelled', 'fulfilled', 'refunded'].includes(input.kind)) {
    issues.push({ code: 'unsupported_event', message: `Event ${input.kind} is not supported in v1.`, field: 'kind', blocking: true });
  }
  if (input.kind === 'refunded' && !input.externalRefundId?.trim()) {
    issues.push({ code: 'missing_refund_id', message: 'Refund events need an immutable store refund ID.', field: 'externalRefundId', blocking: true });
  }
  return issues;
}

export function fail(code: ConstructorParameters<typeof CommerceError>[0]['code'], message: string, details?: Record<string, unknown>): never {
  throw new CommerceError({
    code,
    message,
    httpStatus: httpStatusFor(code),
    details,
  });
}
