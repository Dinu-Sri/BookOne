/**
 * Input VAT follows company registration + operator claim (invoiceKind=tax_invoice)
 * on posted purchase bills, cash purchases, and purchase returns. Purchase orders
 * and GRNs store an intended claim only; they do not post input VAT.
 */

export const INELIGIBLE_INPUT_VAT_MESSAGE =
  'Claiming input VAT requires VAT registration in Sales Settings. No document was posted.';

export function isPurchaseInputVatPostingDocument(documentType: string): boolean {
  return (
    documentType === 'purchase' ||
    documentType === 'import_purchase' ||
    documentType === 'vendor_bill' ||
    documentType === 'cash_purchase' ||
    documentType === 'purchase_return'
  );
}

export function isPurchaseCommercialDocument(documentType: string): boolean {
  return (
    isPurchaseInputVatPostingDocument(documentType) ||
    documentType === 'purchase_order' ||
    documentType === 'goods_receipt'
  );
}

export function purchaseDocumentPostsInputVat(args: {
  documentType: string;
  invoiceKind: string;
}): boolean {
  return args.invoiceKind === 'tax_invoice' && isPurchaseInputVatPostingDocument(args.documentType);
}

export function ineligibleInputVat(args: {
  invoiceKind: string;
  vatRegistered: boolean;
  explicitRequest?: boolean;
}): string | null {
  if (args.invoiceKind !== 'tax_invoice' && !args.explicitRequest) return null;
  const requested = args.invoiceKind === 'tax_invoice' || args.explicitRequest === true;
  if (requested && !args.vatRegistered) return INELIGIBLE_INPUT_VAT_MESSAGE;
  return null;
}

export function purchaseInputVatRatePercent(args: {
  vatRegistered: boolean;
  ratePercent: number;
}): number {
  if (!args.vatRegistered) return 0;
  return Math.max(0, args.ratePercent);
}

export function postedPurchaseVatRatePercent(args: {
  documentType: string;
  invoiceKind: string;
  vatRegistered: boolean;
  ratePercent: number;
}): number {
  if (!purchaseDocumentPostsInputVat({ documentType: args.documentType, invoiceKind: args.invoiceKind })) {
    return 0;
  }
  return purchaseInputVatRatePercent(args);
}

export function expectedPurchaseVat(args: {
  net: number;
  invoiceKind: string;
  vatRegistered: boolean;
  ratePercent: number;
}): { vatRate: number; vatAmount: number; invoiceTotal: number } {
  const vatRate = args.invoiceKind === 'tax_invoice' ? purchaseInputVatRatePercent(args) : 0;
  const vatAmount = Math.round(((Math.max(0, args.net) * vatRate) / 100) * 100) / 100;
  return {
    vatRate,
    vatAmount,
    invoiceTotal: Math.round((Math.max(0, args.net) + vatAmount) * 100) / 100,
  };
}
