import { describe, expect, it } from 'vitest';
import {
  rentalBookingIsConfirmed,
  rentalInvoiceIsBillingOnly,
  shouldSkipHireSourceConversion,
} from '../src/rental-guards';

describe('hire source conversion skip', () => {
  it('skips conversion only for linked sales invoices', () => {
    expect(
      shouldSkipHireSourceConversion({
        linkSourceWithoutConversion: true,
        documentType: 'sales_invoice',
      }),
    ).toBe(true);
    expect(
      shouldSkipHireSourceConversion({
        linkSourceWithoutConversion: true,
        documentType: 'sales_order',
      }),
    ).toBe(false);
    expect(
      shouldSkipHireSourceConversion({
        linkSourceWithoutConversion: false,
        documentType: 'sales_invoice',
      }),
    ).toBe(false);
  });
});

describe('after-return hire invoice billing-only', () => {
  it('bills a reserved or deposited order without a second reservation', () => {
    expect(
      rentalInvoiceIsBillingOnly({
        documentType: 'sales_invoice',
        sourceHasConfirmedBookings: true,
        sourceDepositHeld: 0,
      }),
    ).toBe(true);
    expect(
      rentalInvoiceIsBillingOnly({
        documentType: 'sales_invoice',
        sourceHasConfirmedBookings: false,
        sourceDepositHeld: 1000,
      }),
    ).toBe(true);
    expect(
      rentalInvoiceIsBillingOnly({
        documentType: 'sales_order',
        sourceHasConfirmedBookings: true,
        sourceDepositHeld: 1000,
      }),
    ).toBe(false);
    expect(
      rentalInvoiceIsBillingOnly({
        documentType: 'sales_invoice',
        sourceHasConfirmedBookings: false,
        sourceDepositHeld: 0,
      }),
    ).toBe(false);
  });

  it('treats reserved, dispatched and returned lines as confirmed', () => {
    expect(rentalBookingIsConfirmed('hold')).toBe(false);
    expect(rentalBookingIsConfirmed('reserved')).toBe(true);
    expect(rentalBookingIsConfirmed('dispatched')).toBe(true);
    expect(rentalBookingIsConfirmed('returned')).toBe(true);
    expect(rentalBookingIsConfirmed('hold', 10, 0)).toBe(true);
  });
});
