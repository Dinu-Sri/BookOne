import { describe, expect, it } from 'vitest';
import {
  buildSalesInvoicePosting,
  buildSalesReturnPosting,
  buildStockAdjustmentPosting,
  buildVendorBillPosting,
  buildCashPurchasePosting,
  buildPurchaseReturnPosting,
  sumSides,
} from '../src/engine/document-posting';

describe('sales invoice posting', () => {
  it('posts AR + revenue for service lines', () => {
    const result = buildSalesInvoicePosting({
      lines: [{ description: 'Consulting', quantity: 2, unitPrice: 150, unitCost: 0, productType: 'service' }],
    });
    expect(result.netTotal).toBe(300);
    expect(result.grandTotal).toBe(300);
    expect(result.vatTotal).toBe(0);
    expect(result.cogsTotal).toBe(0);
    expect(sumSides(result.lines)).toEqual({ debit: 300, credit: 300 });
    expect(result.lines.some((l) => l.accountCode === '1300' && l.side === 'debit')).toBe(true);
    expect(result.lines.some((l) => l.accountCode === '4000' && l.side === 'credit')).toBe(true);
  });

  it('posts tax invoice with 18% output VAT', () => {
    const result = buildSalesInvoicePosting({
      lines: [{ description: 'Goods', quantity: 1, unitPrice: 1000, unitCost: 0, productType: 'service' }],
      vatRatePercent: 18,
    });
    expect(result.netTotal).toBe(1000);
    expect(result.vatTotal).toBe(180);
    expect(result.grandTotal).toBe(1180);
    expect(result.lines.some((l) => l.accountCode === '1300' && l.amount === 1180)).toBe(true);
    expect(result.lines.some((l) => l.accountCode === '4000' && l.amount === 1000)).toBe(true);
    expect(result.lines.some((l) => l.accountCode === '2200' && l.side === 'credit' && l.amount === 180)).toBe(true);
    expect(sumSides(result.lines)).toEqual({ debit: 1180, credit: 1180 });
  });

  it('posts COGS and inventory for physical (and legacy stocked) lines', () => {
    const result = buildSalesInvoicePosting({
      lines: [{ description: 'Widget', quantity: 2, unitPrice: 150, unitCost: 100, productType: 'physical' }],
    });
    expect(result.netTotal).toBe(300);
    expect(result.grandTotal).toBe(300);
    expect(result.cogsTotal).toBe(200);
    expect(sumSides(result.lines)).toEqual({ debit: 500, credit: 500 });
    expect(result.lines.some((l) => l.accountCode === '5000' && l.side === 'debit' && l.amount === 200)).toBe(true);
    expect(result.lines.some((l) => l.accountCode === '5100' && l.side === 'credit' && l.amount === 200)).toBe(true);

    const legacy = buildSalesInvoicePosting({
      lines: [{ description: 'Legacy', quantity: 1, unitPrice: 10, unitCost: 4, productType: 'stocked' }],
    });
    expect(legacy.cogsTotal).toBe(4);
  });

  it('does not post COGS for digital or service lines', () => {
    for (const productType of ['digital', 'service'] as const) {
      const result = buildSalesInvoicePosting({
        lines: [{ description: 'Item', quantity: 2, unitPrice: 150, unitCost: 100, productType }],
      });
      expect(result.cogsTotal).toBe(0);
      expect(result.lines.some((l) => l.accountCode === '5100')).toBe(false);
      expect(sumSides(result.lines)).toEqual({ debit: 300, credit: 300 });
    }
  });

  it('POS cash sale debits cash not AR', () => {
    const result = buildSalesInvoicePosting({
      lines: [{ description: 'Widget', quantity: 1, unitPrice: 150, unitCost: 100, productType: 'physical' }],
      settledCashAccountCode: '1000',
    });
    expect(result.lines.some((l) => l.accountCode === '1000' && l.side === 'debit')).toBe(true);
    expect(result.lines.some((l) => l.accountCode === '1300')).toBe(false);
  });

  it('applies header discount to net revenue', () => {
    const result = buildSalesInvoicePosting({
      lines: [{ description: 'A', quantity: 1, unitPrice: 100, unitCost: 0, productType: 'service' }],
      headerDiscount: 10,
    });
    expect(result.netTotal).toBe(90);
  });
});

describe('sales return posting', () => {
  it('uses sales returns account and reverses COGS', () => {
    const result = buildSalesReturnPosting({
      lines: [{ description: 'Widget', quantity: 1, unitPrice: 150, unitCost: 100, productType: 'physical' }],
    });
    expect(result.netTotal).toBe(150);
    expect(result.lines.some((l) => l.accountCode === '4100' && l.side === 'debit')).toBe(true);
    expect(result.lines.some((l) => l.accountCode === '1300' && l.side === 'credit')).toBe(true);
    expect(result.lines.some((l) => l.accountCode === '5100' && l.side === 'debit' && l.amount === 100)).toBe(true);
    expect(sumSides(result.lines)).toEqual({ debit: 250, credit: 250 });
  });
});

describe('vendor bill + purchase return + stock adjustment', () => {
  it('posts AP bill', () => {
    const lines = buildVendorBillPosting({ total: 500, expenseAccountCode: '6800' });
    expect(sumSides(lines)).toEqual({ debit: 500, credit: 500 });
  });

  it('posts inventory import purchase to 5100/2100', () => {
    const lines = buildVendorBillPosting({
      total: 1000,
      expenseAccountCode: '6800',
      isInventoryPurchase: true,
      memo: 'Import',
    });
    expect(lines.some((l) => l.accountCode === '5100' && l.side === 'debit')).toBe(true);
    expect(lines.some((l) => l.accountCode === '2100' && l.side === 'credit')).toBe(true);
  });

  it('posts import with landed cost into inventory and AP', () => {
    const lines = buildVendorBillPosting({
      total: 1000,
      expenseAccountCode: '6800',
      isInventoryPurchase: true,
      landedExtra: 150,
    });
    expect(lines.find((l) => l.accountCode === '5100')?.amount).toBe(1150);
    expect(lines.find((l) => l.accountCode === '2100')?.amount).toBe(1150);
    expect(sumSides(lines)).toEqual({ debit: 1150, credit: 1150 });
  });

  it('posts AP bill with input VAT 18%', () => {
    const lines = buildVendorBillPosting({
      total: 1000,
      expenseAccountCode: '6800',
      vatRatePercent: 18,
    });
    expect(lines.find((l) => l.accountCode === '6800')?.amount).toBe(1000);
    expect(lines.find((l) => l.accountCode === '2300')?.amount).toBe(180);
    expect(lines.find((l) => l.accountCode === '2100')?.amount).toBe(1180);
    expect(sumSides(lines)).toEqual({ debit: 1180, credit: 1180 });
  });

  it('posts cash purchase to inventory/bank without AP', () => {
    const lines = buildCashPurchasePosting({
      total: 300,
      expenseAccountCode: '6800',
      paymentAccountCode: '1000',
      isInventoryPurchase: true,
    });
    expect(lines.some((l) => l.accountCode === '5100' && l.side === 'debit')).toBe(true);
    expect(lines.some((l) => l.accountCode === '1000' && l.side === 'credit')).toBe(true);
    expect(lines.some((l) => l.accountCode === '2100')).toBe(false);
    expect(sumSides(lines)).toEqual({ debit: 300, credit: 300 });
  });

  it('posts purchase return reversing AP and inventory', () => {
    const lines = buildPurchaseReturnPosting({
      total: 200,
      isInventoryPurchase: true,
    });
    expect(lines.some((l) => l.accountCode === '2100' && l.side === 'debit')).toBe(true);
    expect(lines.some((l) => l.accountCode === '5100' && l.side === 'credit')).toBe(true);
    expect(sumSides(lines)).toEqual({ debit: 200, credit: 200 });
  });

  it('posts purchase return with input VAT reverse', () => {
    const lines = buildPurchaseReturnPosting({
      total: 100,
      isInventoryPurchase: true,
      vatRatePercent: 18,
    });
    expect(lines.find((l) => l.accountCode === '2100')?.amount).toBe(118);
    expect(lines.find((l) => l.accountCode === '2300')?.side).toBe('credit');
    expect(sumSides(lines)).toEqual({ debit: 118, credit: 118 });
  });

  it('posts inventory decrease adjustment', () => {
    const lines = buildStockAdjustmentPosting({ quantityDelta: -2, unitCost: 50 });
    expect(lines.find((l) => l.accountCode === '5100')?.side).toBe('credit');
    expect(sumSides(lines)).toEqual({ debit: 100, credit: 100 });
  });
});
