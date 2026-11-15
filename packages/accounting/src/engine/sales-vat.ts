/**
 * Output VAT follows product tax classification + company registration + channel
 * on posted tax invoices. Quotes and sales orders store an intended tax profile
 * only; they do not post VAT. Commercial invoices do not post output VAT.
 */

export const INELIGIBLE_TAX_INVOICE_MESSAGE =
  'Tax invoices require VAT registration in Sales Settings. No document was posted.';

export function lineIsOutputTaxable(taxStatus: string | null | undefined): boolean {
  return String(taxStatus ?? 'unknown') !== 'exempt';
}

export function salesOutputVatRatePercent(args: {
  vatRegistered: boolean;
  saleChannel: string;
  domesticRatePercent: number;
  exportRatePercent: number;
}): number {
  if (!args.vatRegistered) return 0;
  if (args.saleChannel === 'export') return Math.max(0, args.exportRatePercent);
  return Math.max(0, args.domesticRatePercent);
}

export function isSalesTaxPostingDocument(documentType: string): boolean {
  return (
    documentType === 'sales_invoice' ||
    documentType === 'pos_sale' ||
    documentType === 'sales_return'
  );
}

export function salesDocumentPostsOutputVat(args: {
  documentType: string;
  invoiceKind: string;
}): boolean {
  return args.invoiceKind === 'tax_invoice' && isSalesTaxPostingDocument(args.documentType);
}

export type SalesTaxProfile = {
  invoiceKind: 'commercial' | 'tax_invoice';
  saleChannel: 'local' | 'export';
};

function asInvoiceKind(value: string | null | undefined): 'commercial' | 'tax_invoice' {
  return value === 'tax_invoice' ? 'tax_invoice' : 'commercial';
}

function asSaleChannel(value: string | null | undefined): 'local' | 'export' {
  return value === 'export' ? 'export' : 'local';
}

/** Intended or posted tax profile. Non-VAT companies stay commercial. */
export function resolveSalesTaxProfile(args: {
  vatRegistered: boolean;
  requestedKind?: string | null;
  requestedChannel?: string | null;
  sourceKind?: string | null;
  sourceChannel?: string | null;
  preferSource?: boolean;
}): SalesTaxProfile {
  const kindRaw = args.preferSource
    ? (args.sourceKind ?? args.requestedKind)
    : (args.requestedKind ?? args.sourceKind);
  const channelRaw = args.preferSource
    ? (args.sourceChannel ?? args.requestedChannel)
    : (args.requestedChannel ?? args.sourceChannel);
  const saleChannel = asSaleChannel(channelRaw);
  if (!args.vatRegistered) {
    return { invoiceKind: 'commercial', saleChannel };
  }
  return { invoiceKind: asInvoiceKind(kindRaw), saleChannel };
}

export function ineligibleTaxInvoice(args: {
  invoiceKind: string;
  vatRegistered: boolean;
  explicitRequest?: boolean;
}): string | null {
  if (args.invoiceKind !== 'tax_invoice' && !args.explicitRequest) return null;
  const requestedTax = args.invoiceKind === 'tax_invoice' || args.explicitRequest === true;
  if (requestedTax && !args.vatRegistered) return INELIGIBLE_TAX_INVOICE_MESSAGE;
  return null;
}

export function postedSalesVatRatePercent(args: {
  documentType: string;
  invoiceKind: string;
  vatRegistered: boolean;
  saleChannel: string;
  domesticRatePercent: number;
  exportRatePercent: number;
}): number {
  if (!salesDocumentPostsOutputVat({ documentType: args.documentType, invoiceKind: args.invoiceKind })) {
    return 0;
  }
  return salesOutputVatRatePercent(args);
}

export function expectedInvoiceVat(args: {
  net: number;
  invoiceKind: string;
  vatRegistered: boolean;
  saleChannel: string;
  domesticRatePercent: number;
  exportRatePercent: number;
}): { vatRate: number; vatAmount: number; invoiceTotal: number } {
  const vatRate =
    args.invoiceKind === 'tax_invoice'
      ? salesOutputVatRatePercent(args)
      : 0;
  const vatAmount = Math.round(((Math.max(0, args.net) * vatRate) / 100) * 100) / 100;
  return {
    vatRate,
    vatAmount,
    invoiceTotal: Math.round((Math.max(0, args.net) + vatAmount) * 100) / 100,
  };
}

const SALES_TYPE_LABEL: Record<string, string> = {
  quotation: 'Quotation',
  sales_order: 'Sales order',
  sales_invoice: 'Invoice',
  customer_invoice: 'Invoice',
  sales_return: 'Sales return',
  pos_sale: 'POS sale',
};

export type SalesDocumentPresentation = {
  typeLabel: string;
  taxTreatmentLabel: string;
  taxNumberLabel: string | null;
  taxNumberValue: string | null;
  postsOutputVat: boolean;
};

/**
 * Document type, tax treatment, and tax-invoice number are separate.
 * Quotes/orders may store an intended tax invoice without posting VAT
 * and without using the quotation/order number as a tax invoice number.
 */
export function salesDocumentPresentation(args: {
  documentType: string;
  invoiceKind: string;
  documentNumber: string;
  taxInvoiceNumber?: string | null;
  posted?: boolean;
}): SalesDocumentPresentation {
  const typeLabel = SALES_TYPE_LABEL[args.documentType] ?? args.documentType;
  const taxInvoice = args.invoiceKind === 'tax_invoice';
  const postsOutputVat = salesDocumentPostsOutputVat({
    documentType: args.documentType,
    invoiceKind: args.invoiceKind,
  });
  if (!taxInvoice) {
    return {
      typeLabel,
      taxTreatmentLabel: 'Commercial — no output VAT',
      taxNumberLabel: null,
      taxNumberValue: null,
      postsOutputVat,
    };
  }
  if (!postsOutputVat) {
    return {
      typeLabel,
      taxTreatmentLabel: 'Intended tax invoice — VAT posts when invoiced',
      taxNumberLabel: null,
      taxNumberValue: null,
      postsOutputVat,
    };
  }
  return {
    typeLabel,
    taxTreatmentLabel: 'Tax invoice',
    taxNumberLabel: 'Tax invoice no.',
    taxNumberValue: args.taxInvoiceNumber || null,
    postsOutputVat,
  };
}
