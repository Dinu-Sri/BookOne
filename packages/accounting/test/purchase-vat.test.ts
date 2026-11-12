import { describe, expect, it } from 'vitest';
import {
  INELIGIBLE_INPUT_VAT_MESSAGE,
  expectedPurchaseVat,
  ineligibleInputVat,
  postedPurchaseVatRatePercent,
  purchaseDocumentPostsInputVat,
  resolveSalesTaxProfile,
} from '../src/index';
import { remainingQty, qtyExceedsRemaining } from '../src/document-guards';

describe('purchase input VAT posting documents', () => {
  it('keeps Claim input VAT informational on PO and GRN (no posted VAT)', () => {
    expect(
      purchaseDocumentPostsInputVat({ documentType: 'purchase_order', invoiceKind: 'tax_invoice' }),
    ).toBe(false);
    expect(
      purchaseDocumentPostsInputVat({ documentType: 'goods_receipt', invoiceKind: 'tax_invoice' }),
    ).toBe(false);
    expect(
      postedPurchaseVatRatePercent({
        documentType: 'purchase_order',
        invoiceKind: 'tax_invoice',
        vatRegistered: true,
        ratePercent: 18,
      }),
    ).toBe(0);
    expect(
      postedPurchaseVatRatePercent({
        documentType: 'goods_receipt',
        invoiceKind: 'tax_invoice',
        vatRegistered: true,
        ratePercent: 18,
      }),
    ).toBe(0);
  });

  it('posts 18% only on claimed purchase bills / cash / returns when registered', () => {
    expect(purchaseDocumentPostsInputVat({ documentType: 'purchase', invoiceKind: 'tax_invoice' })).toBe(
      true,
    );
    expect(purchaseDocumentPostsInputVat({ documentType: 'purchase', invoiceKind: 'commercial' })).toBe(
      false,
    );
    expect(
      postedPurchaseVatRatePercent({
        documentType: 'purchase',
        invoiceKind: 'tax_invoice',
        vatRegistered: true,
        ratePercent: 18,
      }),
    ).toBe(18);
    expect(
      postedPurchaseVatRatePercent({
        documentType: 'purchase',
        invoiceKind: 'commercial',
        vatRegistered: true,
        ratePercent: 18,
      }),
    ).toBe(0);
    expect(
      postedPurchaseVatRatePercent({
        documentType: 'cash_purchase',
        invoiceKind: 'tax_invoice',
        vatRegistered: true,
        ratePercent: 18,
      }),
    ).toBe(18);
    expect(
      postedPurchaseVatRatePercent({
        documentType: 'purchase_return',
        invoiceKind: 'tax_invoice',
        vatRegistered: true,
        ratePercent: 18,
      }),
    ).toBe(18);
  });
});

describe('PO → GRN → bill input VAT profile', () => {
  it('copies source Claim input VAT through conversion and allows bill override', () => {
    expect(
      resolveSalesTaxProfile({
        vatRegistered: true,
        sourceKind: 'tax_invoice',
        sourceChannel: 'local',
      }),
    ).toEqual({ invoiceKind: 'tax_invoice', saleChannel: 'local' });
    expect(
      resolveSalesTaxProfile({
        vatRegistered: true,
        sourceKind: 'tax_invoice',
        sourceChannel: 'local',
        requestedKind: 'commercial',
      }),
    ).toEqual({ invoiceKind: 'commercial', saleChannel: 'local' });
    expect(
      resolveSalesTaxProfile({
        vatRegistered: true,
        preferSource: true,
        requestedKind: 'commercial',
        sourceKind: 'tax_invoice',
        sourceChannel: 'local',
      }),
    ).toEqual({ invoiceKind: 'tax_invoice', saleChannel: 'local' });
  });

  it('registered 18% 10×60 claimed bill is 600 / 108 / 708; commercial stays 600', () => {
    expect(
      expectedPurchaseVat({
        net: 600,
        invoiceKind: 'tax_invoice',
        vatRegistered: true,
        ratePercent: 18,
      }),
    ).toEqual({ vatRate: 18, vatAmount: 108, invoiceTotal: 708 });
    expect(
      expectedPurchaseVat({
        net: 600,
        invoiceKind: 'commercial',
        vatRegistered: true,
        ratePercent: 18,
      }),
    ).toEqual({ vatRate: 0, vatAmount: 0, invoiceTotal: 600 });
  });

  it('direct PO → bill eligible path uses the same 708 claim', () => {
    const poPosted = postedPurchaseVatRatePercent({
      documentType: 'purchase_order',
      invoiceKind: 'tax_invoice',
      vatRegistered: true,
      ratePercent: 18,
    });
    const bill = expectedPurchaseVat({
      net: 600,
      invoiceKind: 'tax_invoice',
      vatRegistered: true,
      ratePercent: 18,
    });
    expect(poPosted).toBe(0);
    expect(bill).toEqual({ vatRate: 18, vatAmount: 108, invoiceTotal: 708 });
  });

  it('supplier return of 2 units reverses 120 / 21.60 / 141.60 leaving AP 566.40', () => {
    const bill = expectedPurchaseVat({
      net: 600,
      invoiceKind: 'tax_invoice',
      vatRegistered: true,
      ratePercent: 18,
    });
    const credit = expectedPurchaseVat({
      net: 120,
      invoiceKind: 'tax_invoice',
      vatRegistered: true,
      ratePercent: 18,
    });
    expect(credit).toEqual({ vatRate: 18, vatAmount: 21.6, invoiceTotal: 141.6 });
    expect(Math.round((bill.invoiceTotal - credit.invoiceTotal) * 100) / 100).toBe(566.4);
  });

  it('preserves stored 18% on a return after settings move to 15%', () => {
    expect(
      expectedPurchaseVat({
        net: 120,
        invoiceKind: 'tax_invoice',
        vatRegistered: true,
        ratePercent: 18,
      }),
    ).toEqual({ vatRate: 18, vatAmount: 21.6, invoiceTotal: 141.6 });
    expect(
      expectedPurchaseVat({
        net: 600,
        invoiceKind: 'tax_invoice',
        vatRegistered: true,
        ratePercent: 15,
      }).vatAmount,
    ).toBe(90);
  });

  it('refuses ineligible explicit claims with zero effects', () => {
    expect(ineligibleInputVat({ invoiceKind: 'tax_invoice', vatRegistered: false })).toBe(
      INELIGIBLE_INPUT_VAT_MESSAGE,
    );
    expect(ineligibleInputVat({ invoiceKind: 'commercial', vatRegistered: false })).toBeNull();
    expect(ineligibleInputVat({ invoiceKind: 'tax_invoice', vatRegistered: true })).toBeNull();
    expect(
      expectedPurchaseVat({
        net: 600,
        invoiceKind: 'tax_invoice',
        vatRegistered: false,
        ratePercent: 18,
      }),
    ).toEqual({ vatRate: 0, vatAmount: 0, invoiceTotal: 600 });
    expect(
      postedPurchaseVatRatePercent({
        documentType: 'purchase',
        invoiceKind: 'tax_invoice',
        vatRegistered: false,
        ratePercent: 18,
      }),
    ).toBe(0);
  });

  it('denies a second conversion of the same 10 units', () => {
    const remainingBill = remainingQty(10, 10);
    const remainingReceive = remainingQty(10, 10);
    expect(remainingBill).toBe(0);
    expect(remainingReceive).toBe(0);
    expect(qtyExceedsRemaining(10, remainingBill)).toBe(true);
    expect(qtyExceedsRemaining(1, remainingReceive)).toBe(true);
    expect(qtyExceedsRemaining(0, remainingBill)).toBe(false);
  });
});
