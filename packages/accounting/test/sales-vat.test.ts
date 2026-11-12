import { describe, expect, it } from 'vitest';
import {
  INELIGIBLE_TAX_INVOICE_MESSAGE,
  expectedInvoiceVat,
  ineligibleTaxInvoice,
  lineIsOutputTaxable,
  postedSalesVatRatePercent,
  resolveSalesTaxProfile,
  salesDocumentPostsOutputVat,
  salesOutputVatRatePercent,
} from '../src/engine/sales-vat';

describe('sales output VAT classification (BUG-0036)', () => {
  it('charges domestic VAT when the company is registered', () => {
    expect(
      salesOutputVatRatePercent({
        vatRegistered: true,
        saleChannel: 'local',
        domesticRatePercent: 18,
        exportRatePercent: 0,
      }),
    ).toBe(18);
  });

  it('zeros unregistered / export defaults', () => {
    expect(
      salesOutputVatRatePercent({
        vatRegistered: false,
        saleChannel: 'local',
        domesticRatePercent: 18,
        exportRatePercent: 0,
      }),
    ).toBe(0);
    expect(
      salesOutputVatRatePercent({
        vatRegistered: true,
        saleChannel: 'export',
        domesticRatePercent: 18,
        exportRatePercent: 0,
      }),
    ).toBe(0);
  });

  it('skips exempt lines and treats standard/unknown as taxable', () => {
    expect(lineIsOutputTaxable('exempt')).toBe(false);
    expect(lineIsOutputTaxable('standard')).toBe(true);
    expect(lineIsOutputTaxable('unknown')).toBe(true);
    expect(lineIsOutputTaxable(null)).toBe(true);
  });
});

describe('VAT profile through quote → order → invoice', () => {
  it('keeps tax_invoice informational on quotes and orders (no posted VAT)', () => {
    expect(salesDocumentPostsOutputVat({ documentType: 'quotation', invoiceKind: 'tax_invoice' })).toBe(
      false,
    );
    expect(salesDocumentPostsOutputVat({ documentType: 'sales_order', invoiceKind: 'tax_invoice' })).toBe(
      false,
    );
    expect(
      postedSalesVatRatePercent({
        documentType: 'quotation',
        invoiceKind: 'tax_invoice',
        vatRegistered: true,
        saleChannel: 'local',
        domesticRatePercent: 18,
        exportRatePercent: 0,
      }),
    ).toBe(0);
  });

  it('posts 18% only on tax invoices / POS / returns when registered', () => {
    expect(salesDocumentPostsOutputVat({ documentType: 'sales_invoice', invoiceKind: 'tax_invoice' })).toBe(
      true,
    );
    expect(salesDocumentPostsOutputVat({ documentType: 'sales_invoice', invoiceKind: 'commercial' })).toBe(
      false,
    );
    expect(
      postedSalesVatRatePercent({
        documentType: 'sales_invoice',
        invoiceKind: 'tax_invoice',
        vatRegistered: true,
        saleChannel: 'local',
        domesticRatePercent: 18,
        exportRatePercent: 0,
      }),
    ).toBe(18);
    expect(
      postedSalesVatRatePercent({
        documentType: 'sales_invoice',
        invoiceKind: 'commercial',
        vatRegistered: true,
        saleChannel: 'local',
        domesticRatePercent: 18,
        exportRatePercent: 0,
      }),
    ).toBe(0);
    expect(
      postedSalesVatRatePercent({
        documentType: 'pos_sale',
        invoiceKind: 'tax_invoice',
        vatRegistered: true,
        saleChannel: 'local',
        domesticRatePercent: 18,
        exportRatePercent: 0,
      }),
    ).toBe(18);
  });

  it('copies source tax profile through conversion and allows invoice override', () => {
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
        requestedChannel: 'export',
      }),
    ).toEqual({ invoiceKind: 'commercial', saleChannel: 'export' });
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

  it('preserves ordinary non-VAT commercial and rejects ineligible tax invoices', () => {
    expect(
      resolveSalesTaxProfile({
        vatRegistered: false,
        requestedKind: 'tax_invoice',
        sourceKind: 'tax_invoice',
      }),
    ).toEqual({ invoiceKind: 'commercial', saleChannel: 'local' });
    expect(ineligibleTaxInvoice({ invoiceKind: 'tax_invoice', vatRegistered: false })).toBe(
      INELIGIBLE_TAX_INVOICE_MESSAGE,
    );
    expect(ineligibleTaxInvoice({ invoiceKind: 'commercial', vatRegistered: false })).toBeNull();
    expect(ineligibleTaxInvoice({ invoiceKind: 'tax_invoice', vatRegistered: true })).toBeNull();
  });

  it('quote 1000 tax_invoice becomes invoice 1180; commercial stays 1000', () => {
    expect(
      expectedInvoiceVat({
        net: 1000,
        invoiceKind: 'tax_invoice',
        vatRegistered: true,
        saleChannel: 'local',
        domesticRatePercent: 18,
        exportRatePercent: 0,
      }),
    ).toEqual({ vatRate: 18, vatAmount: 180, invoiceTotal: 1180 });
    expect(
      expectedInvoiceVat({
        net: 1000,
        invoiceKind: 'commercial',
        vatRegistered: true,
        saleChannel: 'local',
        domesticRatePercent: 18,
        exportRatePercent: 0,
      }),
    ).toEqual({ vatRate: 0, vatAmount: 0, invoiceTotal: 1000 });
  });
});
