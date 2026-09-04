/** When a hire invoice may be posted, relative to dispatch/return. */

export const HIRE_INVOICE_TIMINGS = ['on_confirm', 'on_dispatch', 'after_return', 'manual'] as const;
export type HireInvoiceTiming = (typeof HIRE_INVOICE_TIMINGS)[number];

export type HireInvoiceStage = 'confirm' | 'dispatch' | 'return';

export function isHireInvoiceTiming(value: string | null | undefined): value is HireInvoiceTiming {
  return Boolean(value && (HIRE_INVOICE_TIMINGS as readonly string[]).includes(value));
}

/**
 * Derive the latest hire stage from booking-line statuses.
 * Empty / hold / reserved → confirm. Any dispatched (and not all returned) → dispatch.
 * All active lines returned → return.
 */
export function inferInvoiceStage(statuses: readonly string[]): HireInvoiceStage {
  const active = statuses.filter((s) => s && s !== 'cancelled');
  if (active.length === 0) return 'confirm';
  if (active.every((s) => s === 'returned')) return 'return';
  if (active.some((s) => s === 'dispatched' || s === 'returned')) return 'dispatch';
  return 'confirm';
}

/** True when invoicing is allowed at or after the configured stage. Manual is always allowed. */
export function invoiceTimingAllowed(timing: HireInvoiceTiming, stage: HireInvoiceStage): boolean {
  if (timing === 'manual' || timing === 'on_confirm') return true;
  if (timing === 'on_dispatch') return stage === 'dispatch' || stage === 'return';
  if (timing === 'after_return') return stage === 'return';
  return false;
}

export function hireInvoiceTimingError(timing: HireInvoiceTiming, stage: HireInvoiceStage): string | null {
  if (invoiceTimingAllowed(timing, stage)) return null;
  if (timing === 'on_dispatch') {
    return 'This hire invoices on dispatch. Dispatch the kit before creating the invoice, or confirm a timing override.';
  }
  if (timing === 'after_return') {
    return 'This hire invoices after return. Record the return before creating the invoice, or confirm a timing override.';
  }
  return 'Hire invoice timing does not allow invoicing at this stage.';
}
