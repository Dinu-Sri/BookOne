import { formatDateMmDdYyyy } from '@bookone/accounting';
import type { PrintData, PrintDesign, PrintKind } from '@bookone/print-design';
import type { DocumentPrintModel } from '@/app/actions/document-print';

function d(v: string | null | undefined) {
  if (!v) return '';
  try {
    return formatDateMmDdYyyy(v);
  } catch {
    return v;
  }
}

/** Does this design print a QR code? (Only then do we make the image.) */
export function designUsesQr(design: PrintDesign) {
  return design.blocks.some((b) => b.element === 'qr_code');
}

/** Map the shared document print model onto the data a print design shows. */
export function printDataFromModel(
  model: DocumentPrintModel,
  kind: PrintKind,
  extra: {
    tradingName?: string;
    assets: PrintData['assets'];
    qrImage?: string | null;
    cashier?: string;
    payment?: PrintData['payment'];
  },
): PrintData {
  const quoteLike = kind === 'quotation' || kind === 'proforma_invoice';
  // A payment receipt has no number of its own: its "number" slot holds the deposit account.
  const receipt = model.kind === 'receipt';
  const number = receipt ? '' : model.meta.number;
  return {
    kind,
    currency: 'LKR',
    company: {
      name: model.company.name,
      tradingName: extra.tradingName ?? '',
      address: model.company.address,
      phone: model.company.phone,
      email: model.company.email,
      website: model.company.website,
      registration: model.company.registrationNumber,
      tin: model.company.tin,
    },
    party: model.party.name || model.party.address ? { ...model.party } : null,
    shipTo: model.party.name || model.party.address ? { name: model.party.name, address: model.party.address, phone: model.party.phone } : null,
    number,
    meta: {
      number,
      date: d(model.meta.date),
      due_date: quoteLike ? '' : d(model.meta.dueDate),
      valid_until: quoteLike ? d(model.meta.dueDate) : '',
      delivery_date: d(model.meta.deliveryDate),
      reference: model.sourceNumber ?? '',
      payment_mode: model.meta.paymentMode ?? '',
      place_of_supply: model.meta.placeOfSupply ?? '',
      channel: model.meta.channel ?? '',
      cashier: extra.cashier ?? '',
      deposited_to: receipt ? model.meta.number : '',
    },
    lines: model.lines.map((l) => ({
      sku: l.sku && l.sku !== '—' ? l.sku : '',
      description: l.description,
      quantity: l.quantity,
      unit: '',
      unitPrice: l.unitPrice,
      discount: l.discount,
      tax: 0,
      amount: l.amount,
    })),
    totals: {
      subtotal: model.totals.subtotal,
      discount: model.totals.discount,
      vat: model.totals.vat,
      total: model.totals.total,
    },
    vatRate: model.totals.vatRate,
    amountInWords: model.totals.words ?? '',
    payment: extra.payment ?? null,
    notes: model.notes ?? '',
    bankDetails: model.style.showBank ? model.style.bankDetails : model.style.bankDetails || '',
    qrUrl: model.style.publicUrl ?? null,
    qrImage: extra.qrImage ?? null,
    assets: extra.assets,
  };
}

type Assets = PrintData['assets'];

/** POS sale (pos_sale document) → POS bill data. */
export function printDataFromPos(input: {
  doc: {
    documentNumber: string;
    taxInvoiceNumber: string | null;
    issueDate: string;
    paymentMode: string | null;
    subtotal: string | number;
    taxTotal: string | number;
    total: string | number;
    discountTotal?: string | number | null;
    amountInWords: string | null;
    vatRate?: string | number | null;
  };
  party: { displayName?: string | null; name?: string | null; phone?: string | null } | null;
  lines: Array<{ description: string; quantity: string | number; unitPrice?: string | number | null; lineTotal: string | number; lineRef?: string | null }>;
  company: PrintData['company'];
  register: { name?: string | null; receiptFooter?: string | null } | null;
  assets: Assets;
}): PrintData {
  const number = input.doc.taxInvoiceNumber || input.doc.documentNumber;
  return {
    kind: 'pos_bill',
    currency: 'LKR',
    company: input.company,
    party: { name: input.party?.displayName || input.party?.name || 'Walk-in', address: '', phone: input.party?.phone ?? '', tin: '' },
    shipTo: null,
    number,
    meta: { number, date: d(input.doc.issueDate), payment_mode: input.doc.paymentMode ?? '', cashier: input.register?.name ?? '' },
    lines: input.lines.map((l) => ({
      sku: l.lineRef ?? '',
      description: l.description,
      quantity: Number(l.quantity),
      unit: '',
      unitPrice: l.unitPrice != null ? Number(l.unitPrice) : null,
      discount: 0,
      tax: 0,
      amount: Number(l.lineTotal),
    })),
    totals: {
      subtotal: Number(input.doc.subtotal),
      discount: Number(input.doc.discountTotal ?? 0),
      vat: Number(input.doc.taxTotal),
      total: Number(input.doc.total),
    },
    vatRate: Number(input.doc.vatRate ?? 0),
    amountInWords: input.doc.amountInWords ?? '',
    payment: { method: input.doc.paymentMode ?? '', tendered: null, change: null },
    notes: input.register?.receiptFooter ?? '',
    bankDetails: '',
    qrUrl: null,
    qrImage: null,
    assets: input.assets,
  };
}

/** Purchase order or cash purchase (payment voucher) → print data. */
export function printDataFromPurchase(
  kind: 'purchase_order' | 'payment_voucher',
  doc: {
    documentNumber: string;
    issueDate: string;
    dueDate?: string | null;
    deliveryDate?: string | null;
    supplierInvoiceNumber?: string | null;
    paymentMode?: string | null;
    partyName: string;
    discountTotal: number;
    taxTotal: number;
    total: number;
    balanceDue: number;
    notes?: string | null;
    lines: Array<{ description: string; quantity: number | string; unitPrice: number | string; lineTotal: number | string }>;
  },
  company: PrintData['company'],
  assets: Assets,
  subtotalShown: number,
): PrintData {
  return {
    kind,
    currency: 'LKR',
    company,
    party: { name: doc.partyName, address: '', phone: '', tin: '' },
    shipTo: null,
    number: doc.documentNumber,
    meta: {
      number: doc.documentNumber,
      date: d(doc.issueDate),
      due_date: d(doc.dueDate),
      delivery_date: d(doc.deliveryDate),
      reference: doc.supplierInvoiceNumber ?? '',
      payment_mode: doc.paymentMode ?? '',
    },
    lines: doc.lines.map((l) => ({
      sku: '',
      description: l.description,
      quantity: Number(l.quantity),
      unit: '',
      unitPrice: Number(l.unitPrice),
      discount: 0,
      tax: 0,
      amount: Number(l.lineTotal),
    })),
    totals: {
      subtotal: subtotalShown,
      discount: doc.discountTotal,
      vat: doc.taxTotal,
      total: doc.total,
      ...(doc.balanceDue > 0.005 ? { balance: doc.balanceDue } : {}),
    },
    vatRate: 0,
    amountInWords: '',
    payment: null,
    notes: doc.notes ?? '',
    bankDetails: '',
    qrUrl: null,
    qrImage: null,
    assets,
  };
}

/** Web order → packing slip data. */
export function printDataFromWebOrder(
  order: {
    displayNumber: string;
    placedAt: string;
    documentNumber?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    shippingAddress?: string | null;
    customerNote?: string | null;
    paymentMethod?: string | null;
    lines: Array<{ sku: string; description?: string | null; quantity: number | string }>;
  },
  company: PrintData['company'],
  assets: Assets,
): PrintData {
  const placed = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Colombo' }).format(new Date(order.placedAt));
  return {
    kind: 'packing_slip',
    currency: 'LKR',
    company,
    party: null,
    shipTo: { name: order.customerName ?? '', address: order.shippingAddress ?? '', phone: order.customerPhone ?? '' },
    number: order.displayNumber,
    meta: { number: order.displayNumber, date: placed, reference: order.documentNumber ?? '', channel: 'Website', payment_mode: order.paymentMethod ?? '' },
    lines: order.lines.map((l) => ({
      sku: l.sku,
      description: l.description ?? '',
      quantity: Number(l.quantity),
      unit: '',
      unitPrice: null,
      discount: 0,
      tax: 0,
      amount: null,
    })),
    totals: {},
    vatRate: 0,
    amountInWords: '',
    payment: null,
    notes: order.customerNote ?? '',
    bankDetails: '',
    qrUrl: null,
    qrImage: null,
    assets,
  };
}

/** Company block from a company profile row. */
export function companyFromProfile(
  c: {
    legalName?: string | null;
    tradingName?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    postalCode?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    registrationNumber?: string | null;
  } | null,
  tin: string,
  fallbackName = 'Company',
): PrintData['company'] {
  return {
    name: c?.legalName || c?.tradingName || fallbackName,
    tradingName: c?.tradingName ?? '',
    address: [c?.addressLine1, c?.addressLine2, c?.city, c?.postalCode].filter(Boolean).join(', '),
    phone: c?.phone ?? '',
    email: c?.email ?? '',
    website: c?.website ?? '',
    registration: c?.registrationNumber ?? '',
    tin,
  };
}
