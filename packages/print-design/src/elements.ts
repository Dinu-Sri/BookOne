import { PRINT_KINDS, type PrintKind } from './kinds';

/**
 * The approved building blocks of a print design. A design may only use these, with these
 * options. Text is plain text (no HTML); images come only from the company's uploaded assets.
 */
export const ELEMENT_KEYS = [
  'logo',
  'company_name',
  'company_details',
  'document_title',
  'document_meta',
  'party',
  'ship_to',
  'lines_table',
  'totals',
  'amount_in_words',
  'payment_info',
  'notes',
  'terms',
  'bank_details',
  'signature',
  'stamp',
  'qr_code',
  'text',
  'divider',
  'spacer',
  'page_footer',
] as const;
export type ElementKey = (typeof ELEMENT_KEYS)[number];

export type AssetSlot = 'logo' | 'signature' | 'stamp';

export type OptionSpec =
  | { type: 'boolean'; label: string; default: boolean }
  | { type: 'enum'; label: string; values: readonly string[]; default: string }
  | { type: 'text'; label: string; maxLength: number; default: string };

/** Fields the document meta block can show, in this order. */
export const META_FIELDS = [
  'number',
  'date',
  'due_date',
  'valid_until',
  'delivery_date',
  'reference',
  'payment_mode',
  'place_of_supply',
  'channel',
  'cashier',
  'deposited_to',
] as const;
export type MetaField = (typeof META_FIELDS)[number];

export const META_FIELD_LABELS: Record<MetaField, string> = {
  number: 'Number',
  date: 'Date',
  due_date: 'Due date',
  valid_until: 'Valid until',
  delivery_date: 'Delivery date',
  reference: 'Reference',
  payment_mode: 'Payment mode',
  place_of_supply: 'Place of supply',
  channel: 'Sales channel',
  cashier: 'Cashier',
  deposited_to: 'Deposited to',
};

/** Line table columns, in print order. Description and amount (or quantity) are fixed per kind. */
export const LINE_COLUMNS = ['line_no', 'sku', 'description', 'quantity', 'unit', 'unit_price', 'discount', 'tax', 'amount'] as const;
export type LineColumn = (typeof LINE_COLUMNS)[number];

export const LINE_COLUMN_LABELS: Record<LineColumn, string> = {
  line_no: '#',
  sku: 'Code',
  description: 'Description',
  quantity: 'Qty',
  unit: 'Unit',
  unit_price: 'Price',
  discount: 'Discount',
  tax: 'VAT',
  amount: 'Amount',
};

export const TOTAL_ROWS = ['subtotal', 'discount', 'vat', 'total', 'paid', 'balance'] as const;
export type TotalRow = (typeof TOTAL_ROWS)[number];

export type RequirementRule = {
  /** Options that must be on (boolean) for this kind. */
  options?: string[];
  /** Meta fields / columns / total rows that must be listed. */
  fields?: string[];
  /** The block's label or text must contain this (case-insensitive), e.g. "tax invoice". */
  labelIncludes?: string;
  /** Why, in plain words, shown when the rule is broken. */
  why: string;
};

export type ElementSpec = {
  key: ElementKey;
  label: string;
  description: string;
  /** Kinds that may use it; undefined = every kind. */
  kinds?: readonly PrintKind[];
  /** Kinds where at least one block of this element is compulsory. */
  requiredFor: Partial<Record<PrintKind, RequirementRule>>;
  /** At most one block of this element in a design. */
  single: boolean;
  options: Record<string, OptionSpec>;
  /** Uses a field list (meta fields, columns or total rows). */
  fieldList?: { label: string; values: readonly string[]; default: readonly string[] };
  /** The block's own heading/label text may be changed. */
  labelEditable?: { default: string; maxLength: number };
  /** The block carries free text. */
  textEditable?: { maxLength: number; default: string };
  asset?: AssetSlot;
};

const MONEY_KINDS = PRINT_KINDS.filter((k) => k !== 'sales_order' && k !== 'packing_slip');
const ALL_REQUIRED = (why: string): Partial<Record<PrintKind, RequirementRule>> =>
  Object.fromEntries(PRINT_KINDS.map((k) => [k, { why }])) as Partial<Record<PrintKind, RequirementRule>>;

const SIZE = ['sm', 'md', 'lg'] as const;

export const ELEMENTS: Record<ElementKey, ElementSpec> = {
  logo: {
    key: 'logo',
    label: 'Logo',
    description: 'The company logo uploaded in Print designs → Logo and images.',
    requiredFor: {},
    single: true,
    options: { size: { type: 'enum', label: 'Size', values: SIZE, default: 'md' } },
    asset: 'logo',
  },
  company_name: {
    key: 'company_name',
    label: 'Company name',
    description: 'The legal or trading name from Company details.',
    requiredFor: ALL_REQUIRED('Every print item must say who issued it.'),
    single: true,
    options: {
      useTradingName: { type: 'boolean', label: 'Use trading name', default: false },
      size: { type: 'enum', label: 'Size', values: ['md', 'lg', 'xl'], default: 'lg' },
    },
  },
  company_details: {
    key: 'company_details',
    label: 'Company address and contacts',
    description: 'Address, phone, email, website, registration number and TIN from Company details.',
    requiredFor: {
      tax_invoice: {
        options: ['address', 'tin'],
        why: 'A VAT tax invoice must show the supplier address and TIN.',
      },
      credit_note: { options: ['address'], why: 'A credit note must show the issuer address.' },
      invoice: { options: ['address'], why: 'An invoice must show the issuer address.' },
      proforma_invoice: { options: ['address'], why: 'A proforma invoice must show the issuer address.' },
    },
    single: true,
    options: {
      address: { type: 'boolean', label: 'Address', default: true },
      phone: { type: 'boolean', label: 'Phone', default: true },
      email: { type: 'boolean', label: 'Email', default: true },
      website: { type: 'boolean', label: 'Website', default: false },
      registration: { type: 'boolean', label: 'Registration number', default: false },
      tin: { type: 'boolean', label: 'TIN / VAT number', default: false },
      layout: { type: 'enum', label: 'Layout', values: ['lines', 'inline'], default: 'lines' },
    },
  },
  document_title: {
    key: 'document_title',
    label: 'Document title',
    description: 'The big title, such as "Invoice" or "Tax invoice".',
    requiredFor: {
      ...ALL_REQUIRED('The print item must say what it is.'),
      tax_invoice: { labelIncludes: 'tax invoice', why: 'A VAT tax invoice must be titled "Tax invoice".' },
      proforma_invoice: { labelIncludes: 'proforma', why: 'A proforma invoice must say "Proforma" so it is not mistaken for a tax invoice.' },
      credit_note: { labelIncludes: 'credit', why: 'A credit note must say "Credit note".' },
    },
    single: true,
    options: {
      size: { type: 'enum', label: 'Size', values: ['md', 'lg', 'xl'], default: 'xl' },
      showNumber: { type: 'boolean', label: 'Show the number under the title', default: true },
    },
    labelEditable: { default: '', maxLength: 40 },
  },
  document_meta: {
    key: 'document_meta',
    label: 'Number, date and details',
    description: 'Document number, date and other details such as due date or place of supply.',
    requiredFor: {
      ...Object.fromEntries(
        PRINT_KINDS.map((k) => [k, { fields: ['number', 'date'], why: 'Every print item needs its number and date.' }]),
      ),
      tax_invoice: {
        fields: ['number', 'date', 'place_of_supply', 'payment_mode'],
        why: 'A VAT tax invoice must show its number, date, place of supply and payment mode.',
      },
      receipt: { fields: ['date'], why: 'A receipt must show the payment date.' },
    },
    single: false,
    options: {
      layout: { type: 'enum', label: 'Layout', values: ['list', 'grid', 'boxed'], default: 'list' },
    },
    fieldList: { label: 'Details to show', values: META_FIELDS, default: ['number', 'date', 'due_date', 'reference'] },
  },
  party: {
    key: 'party',
    label: 'Customer or supplier',
    description: 'Who the document is for: name, address, phone and TIN.',
    requiredFor: {
      quotation: { why: 'A quotation must say who it is for.' },
      proforma_invoice: { options: ['address'], why: 'A proforma invoice must show the buyer name and address.' },
      invoice: { why: 'An invoice must say who it is for.' },
      tax_invoice: { options: ['address', 'tin'], why: 'A VAT tax invoice must show the purchaser name, address and TIN.' },
      receipt: { why: 'A receipt must say who paid.' },
      credit_note: { why: 'A credit note must say who it is for.' },
      sales_order: { options: ['address'], why: 'A dispatch note must say where the goods go.' },
      purchase_order: { why: 'A purchase order must name the supplier.' },
      payment_voucher: { why: 'A payment voucher must name who was paid.' },
    },
    single: true,
    options: {
      address: { type: 'boolean', label: 'Address', default: true },
      phone: { type: 'boolean', label: 'Phone', default: true },
      tin: { type: 'boolean', label: 'TIN / VAT number', default: false },
      boxed: { type: 'boolean', label: 'In a box', default: false },
    },
    labelEditable: { default: '', maxLength: 40 },
  },
  ship_to: {
    key: 'ship_to',
    label: 'Delivery address',
    description: 'Where the goods are delivered, when it differs from the billing address.',
    kinds: ['quotation', 'proforma_invoice', 'invoice', 'tax_invoice', 'sales_order', 'packing_slip'],
    requiredFor: { packing_slip: { why: 'A packing slip must show where the parcel goes.' } },
    single: true,
    options: { boxed: { type: 'boolean', label: 'In a box', default: false } },
    labelEditable: { default: 'Deliver to', maxLength: 40 },
  },
  lines_table: {
    key: 'lines_table',
    label: 'Items table',
    description: 'The items: description, quantity, price and amount.',
    requiredFor: {
      ...Object.fromEntries(
        MONEY_KINDS.map((k) => [k, { fields: ['description', 'amount'], why: 'The items and their amounts must show.' }]),
      ),
      tax_invoice: {
        fields: ['description', 'quantity', 'amount'],
        why: 'A VAT tax invoice must show each item, its quantity and its value.',
      },
      sales_order: { fields: ['description', 'quantity'], why: 'A dispatch note must show each item and its quantity.' },
      packing_slip: { fields: ['description', 'quantity'], why: 'A packing slip must show each item and its quantity.' },
    },
    single: true,
    options: {
      zebra: { type: 'boolean', label: 'Shade every other row', default: false },
      compact: { type: 'boolean', label: 'Compact rows', default: false },
    },
    fieldList: {
      label: 'Columns',
      values: LINE_COLUMNS,
      default: ['sku', 'description', 'quantity', 'unit_price', 'discount', 'amount'],
    },
  },
  totals: {
    key: 'totals',
    label: 'Totals',
    description: 'Subtotal, discount, VAT and the total.',
    kinds: MONEY_KINDS,
    requiredFor: {
      ...Object.fromEntries(MONEY_KINDS.map((k) => [k, { fields: ['total'], why: 'The total must show.' }])),
      tax_invoice: {
        fields: ['subtotal', 'vat', 'total'],
        why: 'A VAT tax invoice must show the value before VAT, the VAT and the total.',
      },
    },
    single: true,
    options: {
      highlightTotal: { type: 'boolean', label: 'Highlight the total', default: true },
      boxed: { type: 'boolean', label: 'In a box', default: false },
    },
    fieldList: { label: 'Rows', values: TOTAL_ROWS, default: ['subtotal', 'discount', 'vat', 'total'] },
  },
  amount_in_words: {
    key: 'amount_in_words',
    label: 'Amount in words',
    description: 'The total written in words.',
    kinds: MONEY_KINDS,
    requiredFor: { tax_invoice: { why: 'A VAT tax invoice must show the total in words.' } },
    single: true,
    options: {},
    labelEditable: { default: 'Amount in words', maxLength: 40 },
  },
  payment_info: {
    key: 'payment_info',
    label: 'Payment and change',
    description: 'How the customer paid, the amount given and the change.',
    kinds: ['pos_bill', 'receipt', 'invoice', 'tax_invoice'],
    requiredFor: {},
    single: true,
    options: { showChange: { type: 'boolean', label: 'Show change', default: true } },
  },
  notes: {
    key: 'notes',
    label: 'Document notes',
    description: 'The notes typed on this document.',
    requiredFor: {},
    single: true,
    options: {},
    labelEditable: { default: 'Notes', maxLength: 40 },
  },
  terms: {
    key: 'terms',
    label: 'Terms and conditions',
    description: 'Fixed terms printed on every copy, such as validity or return policy.',
    requiredFor: {},
    single: true,
    options: {},
    labelEditable: { default: 'Terms and conditions', maxLength: 40 },
    textEditable: { maxLength: 2000, default: '' },
  },
  bank_details: {
    key: 'bank_details',
    label: 'Bank details for payment',
    description: 'Where to pay. Uses the brand bank details, or the text you type here.',
    requiredFor: {},
    single: true,
    options: {},
    labelEditable: { default: 'Bank details', maxLength: 40 },
    textEditable: { maxLength: 600, default: '' },
  },
  signature: {
    key: 'signature',
    label: 'Signature lines',
    description: 'Lines to sign, such as "Authorised signature" and "Received by". Can show the uploaded signature image.',
    requiredFor: {},
    single: true,
    options: {
      first: { type: 'text', label: 'First line', maxLength: 40, default: 'Authorised signature' },
      second: { type: 'text', label: 'Second line', maxLength: 40, default: '' },
      third: { type: 'text', label: 'Third line', maxLength: 40, default: '' },
      useImage: { type: 'boolean', label: 'Print the uploaded signature on the first line', default: false },
    },
    asset: 'signature',
  },
  stamp: {
    key: 'stamp',
    label: 'Company stamp',
    description: 'The uploaded company stamp or seal image.',
    requiredFor: {},
    single: true,
    options: { size: { type: 'enum', label: 'Size', values: SIZE, default: 'md' } },
    asset: 'stamp',
  },
  qr_code: {
    key: 'qr_code',
    label: 'QR code',
    description: 'A QR code that opens this document online.',
    requiredFor: {},
    single: true,
    options: { size: { type: 'enum', label: 'Size', values: SIZE, default: 'sm' } },
  },
  text: {
    key: 'text',
    label: 'Text',
    description: 'Your own text, such as a thank-you line or a slogan.',
    requiredFor: {},
    single: false,
    options: {
      size: { type: 'enum', label: 'Size', values: ['sm', 'md', 'lg'], default: 'md' },
      bold: { type: 'boolean', label: 'Bold', default: false },
      color: { type: 'enum', label: 'Colour', values: ['text', 'muted', 'accent'], default: 'text' },
    },
    textEditable: { maxLength: 600, default: '' },
  },
  divider: {
    key: 'divider',
    label: 'Line',
    description: 'A thin horizontal line.',
    requiredFor: {},
    single: false,
    options: {
      color: { type: 'enum', label: 'Colour', values: ['line', 'accent'], default: 'line' },
      thick: { type: 'boolean', label: 'Thick', default: false },
    },
  },
  spacer: {
    key: 'spacer',
    label: 'Space',
    description: 'Empty space between parts.',
    requiredFor: {},
    single: false,
    options: { size: { type: 'enum', label: 'Size', values: SIZE, default: 'md' } },
  },
  page_footer: {
    key: 'page_footer',
    label: 'Footer',
    description: 'A short line at the bottom, such as "Thank you for your business".',
    requiredFor: {},
    single: true,
    options: { pageNumbers: { type: 'boolean', label: 'Page numbers', default: false } },
    textEditable: { maxLength: 300, default: '' },
  },
};

export function elementAllowed(element: ElementKey, kind: PrintKind): boolean {
  const spec = ELEMENTS[element];
  return !spec.kinds || spec.kinds.includes(kind);
}

export function requiredElements(kind: PrintKind): ElementKey[] {
  return ELEMENT_KEYS.filter((e) => ELEMENTS[e].requiredFor[kind]);
}

export function isElementKey(v: unknown): v is ElementKey {
  return typeof v === 'string' && (ELEMENT_KEYS as readonly string[]).includes(v);
}
