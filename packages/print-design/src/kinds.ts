/**
 * Print items BookOne can print with a print design. Each kind has a plain name, what it is
 * printed from, the paper it normally uses and a default title.
 */
export const PRINT_KINDS = [
  'quotation',
  'proforma_invoice',
  'invoice',
  'tax_invoice',
  'receipt',
  'credit_note',
  'sales_order',
  'packing_slip',
  'pos_bill',
  'purchase_order',
  'payment_voucher',
] as const;
export type PrintKind = (typeof PRINT_KINDS)[number];

export const PAPERS = ['A4', 'A5', 'Letter', 'thermal80', 'thermal58'] as const;
export type Paper = (typeof PAPERS)[number];

export type PrintKindInfo = {
  kind: PrintKind;
  label: string;
  /** One plain sentence: what it is and where it is printed from. */
  description: string;
  defaultTitle: string;
  defaultPaper: Paper;
  papers: Paper[];
  /** Whether the item lists money (totals must show). */
  hasMoney: boolean;
  /** Whether the item lists lines (the lines table must show). */
  hasLines: boolean;
  /** The other side of the document, as it is labelled by default. */
  partyLabel: string;
};

const SHEETS: Paper[] = ['A4', 'A5', 'Letter'];
const ROLLS: Paper[] = ['thermal80', 'thermal58'];

export const PRINT_KIND_INFO: Record<PrintKind, PrintKindInfo> = {
  quotation: {
    kind: 'quotation',
    label: 'Quotation',
    description: 'A price offer to a customer. Printed from Sales → Quotations.',
    defaultTitle: 'Quotation',
    defaultPaper: 'A4',
    papers: SHEETS,
    hasMoney: true,
    hasLines: true,
    partyLabel: 'Quote for',
  },
  proforma_invoice: {
    kind: 'proforma_invoice',
    label: 'Proforma invoice',
    description: 'An advance invoice before the sale, for payment or import papers. Printed from a quotation or sales order.',
    defaultTitle: 'Proforma invoice',
    defaultPaper: 'A4',
    papers: SHEETS,
    hasMoney: true,
    hasLines: true,
    partyLabel: 'Bill to',
  },
  invoice: {
    kind: 'invoice',
    label: 'Invoice',
    description: 'A sales invoice for a customer who is not charged VAT on a tax invoice. Printed from Sales → Invoices.',
    defaultTitle: 'Invoice',
    defaultPaper: 'A4',
    papers: SHEETS,
    hasMoney: true,
    hasLines: true,
    partyLabel: 'Bill to',
  },
  tax_invoice: {
    kind: 'tax_invoice',
    label: 'VAT tax invoice',
    description: 'A VAT tax invoice. The law sets what it must show, so some parts cannot be removed.',
    defaultTitle: 'Tax invoice',
    defaultPaper: 'A4',
    papers: SHEETS,
    hasMoney: true,
    hasLines: true,
    partyLabel: 'Bill to (purchaser)',
  },
  receipt: {
    kind: 'receipt',
    label: 'Payment receipt',
    description: 'Proof that a customer paid. Printed after recording a customer payment.',
    defaultTitle: 'Payment receipt',
    defaultPaper: 'A4',
    papers: [...SHEETS, ...ROLLS],
    hasMoney: true,
    hasLines: true,
    partyLabel: 'Received from',
  },
  credit_note: {
    kind: 'credit_note',
    label: 'Credit note',
    description: 'Goods returned or an amount taken off an invoice. Printed from Sales → Returns.',
    defaultTitle: 'Credit note',
    defaultPaper: 'A4',
    papers: SHEETS,
    hasMoney: true,
    hasLines: true,
    partyLabel: 'Customer',
  },
  sales_order: {
    kind: 'sales_order',
    label: 'Sales order / dispatch note',
    description: 'What a customer ordered and what leaves the store. Printed from Sales → Orders.',
    defaultTitle: 'Dispatch note',
    defaultPaper: 'A4',
    papers: SHEETS,
    hasMoney: false,
    hasLines: true,
    partyLabel: 'Deliver to',
  },
  packing_slip: {
    kind: 'packing_slip',
    label: 'Packing slip',
    description: 'The list that goes inside a website order parcel. Printed from Commerce → Orders.',
    defaultTitle: 'Packing slip',
    defaultPaper: 'A5',
    papers: [...SHEETS, ...ROLLS],
    hasMoney: false,
    hasLines: true,
    partyLabel: 'Ship to',
  },
  pos_bill: {
    kind: 'pos_bill',
    label: 'POS bill',
    description: 'The bill printed at the shop counter, usually on an 80 mm receipt printer.',
    defaultTitle: 'Bill',
    defaultPaper: 'thermal80',
    papers: [...ROLLS, 'A5', 'A4'],
    hasMoney: true,
    hasLines: true,
    partyLabel: 'Customer',
  },
  purchase_order: {
    kind: 'purchase_order',
    label: 'Purchase order',
    description: 'An order you send to a supplier. Printed from Purchase → Orders.',
    defaultTitle: 'Purchase order',
    defaultPaper: 'A4',
    papers: SHEETS,
    hasMoney: true,
    hasLines: true,
    partyLabel: 'Supplier',
  },
  payment_voucher: {
    kind: 'payment_voucher',
    label: 'Payment voucher',
    description: 'A record of money paid out for an expense or cash purchase, for signing and filing.',
    defaultTitle: 'Payment voucher',
    defaultPaper: 'A5',
    papers: SHEETS,
    hasMoney: true,
    hasLines: true,
    partyLabel: 'Paid to',
  },
};

export function isPrintKind(v: unknown): v is PrintKind {
  return typeof v === 'string' && (PRINT_KINDS as readonly string[]).includes(v);
}

export function isPaper(v: unknown): v is Paper {
  return typeof v === 'string' && (PAPERS as readonly string[]).includes(v);
}

export function paperLabel(p: Paper): string {
  if (p === 'thermal80') return '80 mm receipt roll';
  if (p === 'thermal58') return '58 mm receipt roll';
  return p;
}

export function isRoll(p: Paper): boolean {
  return p === 'thermal80' || p === 'thermal58';
}
