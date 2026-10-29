/**
 * Durable settlement for cash refunds on sales_return / purchase_return.
 *
 * Cash posting and settlement-state are separate. A cash_purchase-linked
 * purchase_return already posts Dr cash / Cr stock-or-expense. The return
 * document itself must also store paidAmount = total, balanceDue = 0, and
 * status refunded. Ordinary AP credits (purchase_return against an open bill)
 * stay on the apply-to-source path and are not treated as cash refunds.
 */

export function purchaseReturnRefundCashAccount(input: {
  sourceDocumentType?: string | null;
  paymentAccountCode?: string | null;
  hasSource: boolean;
}): string | null {
  const tender = String(input.paymentAccountCode ?? '').trim();
  if (input.sourceDocumentType === 'cash_purchase') {
    return tender || '1000';
  }
  if (!input.hasSource && tender) {
    return tender;
  }
  return null;
}

export function isCashSettledReturn(input: {
  documentType: string;
  paymentAccountCode?: string | null;
  sourceDocumentType?: string | null;
  hasSource?: boolean;
}): boolean {
  const tender = String(input.paymentAccountCode ?? '').trim();
  if (input.documentType === 'sales_return') return Boolean(tender);
  if (input.documentType !== 'purchase_return') return false;
  const hasSource = Boolean(input.hasSource ?? input.sourceDocumentType);
  return (
    purchaseReturnRefundCashAccount({
      sourceDocumentType: input.sourceDocumentType,
      paymentAccountCode: input.paymentAccountCode,
      hasSource,
    }) != null
  );
}

export function cashSettledReturnStatus(documentType: string): 'refunded' | null {
  if (documentType === 'sales_return' || documentType === 'purchase_return') return 'refunded';
  return null;
}
