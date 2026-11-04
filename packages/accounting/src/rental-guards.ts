/** Hire-charge invoices link a live booking without converting it. */
export function shouldSkipHireSourceConversion(params: {
  linkSourceWithoutConversion?: boolean | null;
  documentType: string;
}): boolean {
  return params.linkSourceWithoutConversion === true && params.documentType === 'sales_invoice';
}

/**
 * After a hire order already has reserved/dispatched/returned lines or a deposit,
 * a later sales invoice is billing only: do not create a second reservation or
 * void the original event.
 */
export function rentalInvoiceIsBillingOnly(params: {
  documentType: string;
  sourceHasConfirmedBookings: boolean;
  sourceDepositHeld: number;
}): boolean {
  if (params.documentType !== 'sales_invoice' && params.documentType !== 'pos_sale') {
    return false;
  }
  return params.sourceHasConfirmedBookings || params.sourceDepositHeld > 0.0001;
}

export function rentalBookingIsConfirmed(
  status: string,
  dispatchedQty = 0,
  returnedQty = 0,
): boolean {
  if (['reserved', 'dispatched', 'returned'].includes(status)) return true;
  return dispatchedQty > 0.0001 || returnedQty > 0.0001;
}
