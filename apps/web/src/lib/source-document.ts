/** Visible ancestry href for a stored source document. Unsupported types return null. */
export function sourceDocumentHref(
  documentType: string | null | undefined,
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  switch (documentType) {
    case 'quotation':
      return `/sales/quotations/${id}`;
    case 'sales_order':
      return `/sales/orders/${id}`;
    case 'sales_invoice':
    case 'customer_invoice':
      return `/sales/invoices/${id}`;
    case 'sales_return':
      return `/sales/returns/${id}`;
    case 'purchase_order':
      return `/purchase/orders/${id}`;
    default:
      return null;
  }
}

export function sourceDocumentLabel(documentType: string | null | undefined): string {
  if (documentType === 'quotation') return 'Source quotation';
  if (documentType === 'sales_order') return 'Source order';
  if (documentType === 'sales_invoice' || documentType === 'customer_invoice') return 'Source invoice';
  if (documentType === 'sales_return') return 'Source return';
  if (documentType === 'purchase_order') return 'Source purchase order';
  return 'Source document';
}
