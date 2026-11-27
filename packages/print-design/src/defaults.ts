import { DESIGN_SCHEMA, defaultTheme, type Block, type PrintDesign } from './design';
import { PRINT_KIND_INFO, isRoll, type PrintKind } from './kinds';

function b(
  id: string,
  element: Block['element'],
  band: Block['band'],
  column: Block['column'],
  extra: Partial<Omit<Block, 'id' | 'element' | 'band' | 'column'>> = {},
): Record<string, unknown> {
  return { id, element, band, column, align: extra.align ?? 'left', options: extra.options ?? {}, ...extra };
}

/**
 * The BookOne standard design for each print item, as raw input (run it through
 * validateDesign to fill options). Every default meets the item's compulsory set.
 */
export function defaultDesignInput(kind: PrintKind): Record<string, unknown> {
  const info = PRINT_KIND_INFO[kind];
  const roll = isRoll(info.defaultPaper);
  const theme = defaultTheme(kind);

  if (roll) {
    return {
      schema: DESIGN_SCHEMA,
      paper: info.defaultPaper,
      orientation: 'portrait',
      margins: 'narrow',
      columns: {},
      theme,
      blocks: [
        b('logo', 'logo', 'header', 1, { align: 'center', options: { size: 'sm' } }),
        b('company', 'company_name', 'header', 1, { align: 'center', options: { size: 'md' } }),
        b('contacts', 'company_details', 'header', 1, { align: 'center', options: { address: true, phone: true, email: false } }),
        b('title', 'document_title', 'top', 1, { align: 'center', options: { size: 'md', showNumber: false } }),
        b('meta', 'document_meta', 'top', 1, { fields: ['number', 'date', 'cashier'], options: { layout: 'list' } }),
        b('lines', 'lines_table', 'body', 1, { fields: ['description', 'quantity', 'amount'], options: { compact: true } }),
        b('totals', 'totals', 'bottom', 1, { align: 'right', fields: ['subtotal', 'discount', 'vat', 'total'] }),
        b('payment', 'payment_info', 'bottom', 1, { options: { showChange: true } }),
        b('thanks', 'page_footer', 'footer', 1, { align: 'center', text: 'Thank you. Please come again.' }),
      ],
    };
  }

  const header = [
    b('logo', 'logo', 'header', 1, { options: { size: 'md' } }),
    b('company', 'company_name', 'header', 1),
    b('contacts', 'company_details', 'header', 1, {
      options: { address: true, phone: true, email: true, tin: kind === 'tax_invoice' },
    }),
    b('title', 'document_title', 'header', 2, { align: 'right' }),
  ];

  const metaFields: Record<PrintKind, string[]> = {
    quotation: ['number', 'date', 'valid_until', 'reference'],
    proforma_invoice: ['number', 'date', 'valid_until', 'reference'],
    invoice: ['number', 'date', 'due_date', 'reference'],
    tax_invoice: ['number', 'date', 'due_date', 'place_of_supply', 'payment_mode', 'reference'],
    receipt: ['date', 'deposited_to'],
    credit_note: ['number', 'date', 'reference'],
    sales_order: ['number', 'date', 'delivery_date', 'reference'],
    packing_slip: ['number', 'date', 'channel'],
    pos_bill: ['number', 'date', 'cashier'],
    purchase_order: ['number', 'date', 'delivery_date'],
    payment_voucher: ['number', 'date', 'payment_mode', 'reference'],
  };

  const top: Record<string, unknown>[] = [];
  if (kind === 'packing_slip') {
    top.push(b('shipto', 'ship_to', 'top', 1, { label: 'Ship to' }));
  } else {
    top.push(
      b('party', 'party', 'top', 1, {
        options: { address: true, phone: true, tin: kind === 'tax_invoice' },
      }),
    );
  }
  top.push(b('meta', 'document_meta', 'top', 2, { fields: metaFields[kind], options: { layout: 'list' } }));

  const columns: Record<PrintKind, string[]> = {
    quotation: ['sku', 'description', 'quantity', 'unit_price', 'discount', 'amount'],
    proforma_invoice: ['sku', 'description', 'quantity', 'unit_price', 'discount', 'amount'],
    invoice: ['sku', 'description', 'quantity', 'unit_price', 'discount', 'amount'],
    tax_invoice: ['description', 'quantity', 'unit_price', 'discount', 'amount'],
    receipt: ['sku', 'description', 'amount'],
    credit_note: ['sku', 'description', 'quantity', 'unit_price', 'amount'],
    sales_order: ['line_no', 'sku', 'description', 'quantity', 'unit'],
    packing_slip: ['line_no', 'sku', 'description', 'quantity'],
    pos_bill: ['description', 'quantity', 'amount'],
    purchase_order: ['line_no', 'sku', 'description', 'quantity', 'unit_price', 'amount'],
    payment_voucher: ['description', 'amount'],
  };

  const body = [b('lines', 'lines_table', 'body', 1, { fields: columns[kind] }), b('notes', 'notes', 'body', 1)];

  const bottom: Record<string, unknown>[] = [];
  if (info.hasMoney) {
    bottom.push(
      b('totals', 'totals', 'bottom', 2, {
        align: 'right',
        fields: kind === 'receipt' || kind === 'payment_voucher' ? ['total'] : ['subtotal', 'discount', 'vat', 'total'],
      }),
    );
  }
  if (kind === 'tax_invoice') bottom.push(b('words', 'amount_in_words', 'bottom', 1));
  if (kind === 'invoice' || kind === 'tax_invoice' || kind === 'proforma_invoice' || kind === 'quotation') {
    bottom.push(b('bank', 'bank_details', 'bottom', 1));
  }
  if (kind === 'quotation' || kind === 'proforma_invoice') {
    bottom.push(b('terms', 'terms', 'bottom', 1, { text: 'Prices are valid until the date shown.' }));
  }
  if (kind === 'sales_order' || kind === 'payment_voucher' || kind === 'purchase_order') {
    bottom.push(
      b('sign', 'signature', 'bottom', 1, {
        options: {
          first: kind === 'payment_voucher' ? 'Approved by' : 'Authorised signature',
          second: kind === 'purchase_order' ? '' : 'Received by',
        },
      }),
    );
  }

  const footer =
    kind === 'tax_invoice'
      ? [b('foot', 'page_footer', 'footer', 1, { align: 'center', text: 'This is a tax invoice for VAT purposes.' })]
      : [b('foot', 'page_footer', 'footer', 1, { align: 'center', text: '' })];

  return {
    schema: DESIGN_SCHEMA,
    paper: info.defaultPaper,
    orientation: 'portrait',
    margins: 'normal',
    columns: { header: '3:2', top: '3:2', bottom: '3:2' },
    theme,
    blocks: [...header, ...top, ...body, ...bottom, ...footer],
  };
}

export type { PrintDesign };
