import { describe, expect, it } from 'vitest';
import {
  hireInvoiceTimingError,
  inferInvoiceStage,
  invoiceTimingAllowed,
  isHireInvoiceTiming,
} from '../src/rental-invoice-timing';

describe('inferInvoiceStage', () => {
  it('is confirm when there are no bookings yet', () => {
    expect(inferInvoiceStage([])).toBe('confirm');
  });

  it('is confirm for hold/reserved', () => {
    expect(inferInvoiceStage(['hold'])).toBe('confirm');
    expect(inferInvoiceStage(['reserved', 'reserved'])).toBe('confirm');
  });

  it('is dispatch once any line is out', () => {
    expect(inferInvoiceStage(['reserved', 'dispatched'])).toBe('dispatch');
    expect(inferInvoiceStage(['dispatched'])).toBe('dispatch');
  });

  it('is return only when every active line is back', () => {
    expect(inferInvoiceStage(['returned'])).toBe('return');
    expect(inferInvoiceStage(['returned', 'dispatched'])).toBe('dispatch');
    expect(inferInvoiceStage(['returned', 'cancelled'])).toBe('return');
  });
});

describe('invoiceTimingAllowed', () => {
  it('allows on_confirm and manual at every stage', () => {
    for (const stage of ['confirm', 'dispatch', 'return'] as const) {
      expect(invoiceTimingAllowed('on_confirm', stage)).toBe(true);
      expect(invoiceTimingAllowed('manual', stage)).toBe(true);
    }
  });

  it('blocks on_dispatch until kit is out', () => {
    expect(invoiceTimingAllowed('on_dispatch', 'confirm')).toBe(false);
    expect(invoiceTimingAllowed('on_dispatch', 'dispatch')).toBe(true);
    expect(invoiceTimingAllowed('on_dispatch', 'return')).toBe(true);
  });

  it('blocks after_return until inspection', () => {
    expect(invoiceTimingAllowed('after_return', 'confirm')).toBe(false);
    expect(invoiceTimingAllowed('after_return', 'dispatch')).toBe(false);
    expect(invoiceTimingAllowed('after_return', 'return')).toBe(true);
  });
});

describe('hireInvoiceTimingError', () => {
  it('is silent when allowed', () => {
    expect(hireInvoiceTimingError('on_confirm', 'confirm')).toBeNull();
  });

  it('explains dispatch / return gates', () => {
    expect(hireInvoiceTimingError('on_dispatch', 'confirm')).toMatch(/dispatch/i);
    expect(hireInvoiceTimingError('after_return', 'dispatch')).toMatch(/return/i);
  });

  it('recognises timing strings', () => {
    expect(isHireInvoiceTiming('on_dispatch')).toBe(true);
    expect(isHireInvoiceTiming('whenever')).toBe(false);
  });
});
