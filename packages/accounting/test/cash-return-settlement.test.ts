import { describe, expect, it } from 'vitest';
import {
  cashSettledReturnStatus,
  isCashSettledReturn,
  purchaseReturnRefundCashAccount,
} from '../src/cash-return-settlement';

describe('cash-settled purchase and sales returns', () => {
  it('treats a cash_purchase-linked purchase_return as a cash refund even without a tender code', () => {
    expect(
      isCashSettledReturn({
        documentType: 'purchase_return',
        sourceDocumentType: 'cash_purchase',
        hasSource: true,
      }),
    ).toBe(true);
    expect(
      purchaseReturnRefundCashAccount({
        sourceDocumentType: 'cash_purchase',
        paymentAccountCode: null,
        hasSource: true,
      }),
    ).toBe('1000');
    expect(cashSettledReturnStatus('purchase_return')).toBe('refunded');
  });

  it('uses an explicit liquid tender on a cash_purchase-linked return', () => {
    expect(
      purchaseReturnRefundCashAccount({
        sourceDocumentType: 'cash_purchase',
        paymentAccountCode: '1100',
        hasSource: true,
      }),
    ).toBe('1100');
  });

  it('does not treat an ordinary AP credit (bill-linked purchase_return) as a cash refund', () => {
    expect(
      isCashSettledReturn({
        documentType: 'purchase_return',
        sourceDocumentType: 'purchase',
        paymentAccountCode: '1000',
        hasSource: true,
      }),
    ).toBe(false);
    expect(
      purchaseReturnRefundCashAccount({
        sourceDocumentType: 'purchase',
        paymentAccountCode: '1000',
        hasSource: true,
      }),
    ).toBeNull();
    expect(
      purchaseReturnRefundCashAccount({
        sourceDocumentType: 'vendor_bill',
        paymentAccountCode: '1000',
        hasSource: true,
      }),
    ).toBeNull();
  });

  it('settles a standalone purchase_return only when a refund tender is supplied', () => {
    expect(
      isCashSettledReturn({
        documentType: 'purchase_return',
        paymentAccountCode: '1000',
        hasSource: false,
      }),
    ).toBe(true);
    expect(
      isCashSettledReturn({
        documentType: 'purchase_return',
        hasSource: false,
      }),
    ).toBe(false);
  });

  it('settles an ordinary sales_return when a refund tender is supplied and leaves credit-only open', () => {
    expect(
      isCashSettledReturn({
        documentType: 'sales_return',
        paymentAccountCode: '1000',
      }),
    ).toBe(true);
    expect(
      isCashSettledReturn({
        documentType: 'sales_return',
      }),
    ).toBe(false);
    expect(cashSettledReturnStatus('sales_return')).toBe('refunded');
  });

  it('does not mark cash_purchase or vendor bills as cash-settled returns', () => {
    expect(isCashSettledReturn({ documentType: 'cash_purchase', paymentAccountCode: '1000' })).toBe(
      false,
    );
    expect(isCashSettledReturn({ documentType: 'purchase', paymentAccountCode: '1000' })).toBe(false);
  });
});
