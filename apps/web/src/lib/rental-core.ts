/** Shared rental types/helpers — not a Server Actions file. */

export const HIRE_UNITS = ['event', 'day', 'hour'] as const;
export type HireUnit = (typeof HIRE_UNITS)[number];

export const INVOICE_TIMINGS = ['on_confirm', 'on_dispatch', 'after_return', 'manual'] as const;
export type InvoiceTiming = (typeof INVOICE_TIMINGS)[number];

export const DEPOSIT_MODES = ['none', 'per_event', 'per_item', 'both'] as const;
export type DepositMode = (typeof DEPOSIT_MODES)[number];

export const OVERLAP_POLICIES = ['block', 'warn', 'override', 'allow'] as const;
export type OverlapPolicy = (typeof OVERLAP_POLICIES)[number];

export interface RentalSettingsRow {
  allowHirePerEvent: boolean;
  allowHirePerDay: boolean;
  allowHirePerHour: boolean;
  defaultHireUnit: HireUnit;
  allowInvoiceOnConfirm: boolean;
  allowInvoiceOnDispatch: boolean;
  allowInvoiceAfterReturn: boolean;
  allowInvoiceManual: boolean;
  defaultInvoiceTiming: InvoiceTiming;
  allowInvoiceTimingOverride: boolean;
  allowDepositPerEvent: boolean;
  allowDepositPerItem: boolean;
  defaultDepositMode: DepositMode;
  defaultEventDepositAmount: string;
  defaultEventDepositPercent: string;
  overlapPolicy: OverlapPolicy;
  defaultTurnaroundHours: number;
  defaultLateFeePerDay: string;
}

export const DEFAULT_RENTAL_SETTINGS: RentalSettingsRow = {
  allowHirePerEvent: true,
  allowHirePerDay: true,
  allowHirePerHour: true,
  defaultHireUnit: 'event',
  allowInvoiceOnConfirm: true,
  allowInvoiceOnDispatch: true,
  allowInvoiceAfterReturn: true,
  allowInvoiceManual: true,
  defaultInvoiceTiming: 'on_confirm',
  allowInvoiceTimingOverride: true,
  allowDepositPerEvent: true,
  allowDepositPerItem: true,
  defaultDepositMode: 'per_event',
  defaultEventDepositAmount: '0.00',
  defaultEventDepositPercent: '0.00',
  overlapPolicy: 'override',
  defaultTurnaroundHours: 0,
  defaultLateFeePerDay: '0.00',
};

export type RentalEventInput = {
  eventDate?: string | null;
  hireFrom?: string | null;
  hireTo?: string | null;
  venue?: string | null;
  guestCount?: number | null;
  deliverAt?: string | null;
  collectAt?: string | null;
  packingNotes?: string | null;
  confirmOverlap?: boolean;
  overlapOverrideReason?: string | null;
};

function isDate(v?: string | null): v is string {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

export function resolveHireWindow(input: RentalEventInput): { hireFrom: string; hireTo: string } | null {
  const from = input.hireFrom || input.deliverAt || input.eventDate || '';
  const to = input.hireTo || input.collectAt || input.eventDate || from;
  if (!isDate(from) || !isDate(to)) return null;
  return from <= to ? { hireFrom: from, hireTo: to } : { hireFrom: to, hireTo: from };
}

export function reconcileRentalSettings(input: RentalSettingsRow): RentalSettingsRow {
  const next = { ...input };
  const hireEnabled: HireUnit[] = [];
  if (next.allowHirePerEvent) hireEnabled.push('event');
  if (next.allowHirePerDay) hireEnabled.push('day');
  if (next.allowHirePerHour) hireEnabled.push('hour');
  if (hireEnabled.length === 0) {
    next.allowHirePerEvent = true;
    hireEnabled.push('event');
  }
  if (!hireEnabled.includes(next.defaultHireUnit)) next.defaultHireUnit = hireEnabled[0]!;

  const timingEnabled: InvoiceTiming[] = [];
  if (next.allowInvoiceOnConfirm) timingEnabled.push('on_confirm');
  if (next.allowInvoiceOnDispatch) timingEnabled.push('on_dispatch');
  if (next.allowInvoiceAfterReturn) timingEnabled.push('after_return');
  if (next.allowInvoiceManual) timingEnabled.push('manual');
  if (timingEnabled.length === 0) {
    next.allowInvoiceOnConfirm = true;
    timingEnabled.push('on_confirm');
  }
  if (!timingEnabled.includes(next.defaultInvoiceTiming)) next.defaultInvoiceTiming = timingEnabled[0]!;

  if (next.defaultDepositMode === 'both' && (!next.allowDepositPerEvent || !next.allowDepositPerItem)) {
    if (next.allowDepositPerEvent && next.allowDepositPerItem) next.defaultDepositMode = 'both';
    else if (next.allowDepositPerEvent) next.defaultDepositMode = 'per_event';
    else if (next.allowDepositPerItem) next.defaultDepositMode = 'per_item';
    else next.defaultDepositMode = 'none';
  } else if (next.defaultDepositMode === 'per_event' && !next.allowDepositPerEvent) {
    next.defaultDepositMode = next.allowDepositPerItem ? 'per_item' : 'none';
  } else if (next.defaultDepositMode === 'per_item' && !next.allowDepositPerItem) {
    next.defaultDepositMode = next.allowDepositPerEvent ? 'per_event' : 'none';
  }

  return next;
}

export function mapRentalSettingsRow(row: {
  allowHirePerEvent: string;
  allowHirePerDay: string;
  allowHirePerHour: string;
  defaultHireUnit: string;
  allowInvoiceOnConfirm: string;
  allowInvoiceOnDispatch: string;
  allowInvoiceAfterReturn: string;
  allowInvoiceManual: string;
  defaultInvoiceTiming: string;
  allowInvoiceTimingOverride: string;
  allowDepositPerEvent: string;
  allowDepositPerItem: string;
  defaultDepositMode: string;
  defaultEventDepositAmount: string;
  defaultEventDepositPercent: string;
  overlapPolicy: string;
  defaultTurnaroundHours: number;
  defaultLateFeePerDay?: string | number | null;
}): RentalSettingsRow {
  const hireUnit = HIRE_UNITS.includes(row.defaultHireUnit as HireUnit)
    ? (row.defaultHireUnit as HireUnit)
    : 'event';
  const timing = INVOICE_TIMINGS.includes(row.defaultInvoiceTiming as InvoiceTiming)
    ? (row.defaultInvoiceTiming as InvoiceTiming)
    : 'on_confirm';
  const deposit = DEPOSIT_MODES.includes(row.defaultDepositMode as DepositMode)
    ? (row.defaultDepositMode as DepositMode)
    : 'per_event';
  const overlap = OVERLAP_POLICIES.includes(row.overlapPolicy as OverlapPolicy)
    ? (row.overlapPolicy as OverlapPolicy)
    : 'override';
  return {
    allowHirePerEvent: row.allowHirePerEvent === '1',
    allowHirePerDay: row.allowHirePerDay === '1',
    allowHirePerHour: row.allowHirePerHour === '1',
    defaultHireUnit: hireUnit,
    allowInvoiceOnConfirm: row.allowInvoiceOnConfirm === '1',
    allowInvoiceOnDispatch: row.allowInvoiceOnDispatch === '1',
    allowInvoiceAfterReturn: row.allowInvoiceAfterReturn === '1',
    allowInvoiceManual: row.allowInvoiceManual === '1',
    defaultInvoiceTiming: timing,
    allowInvoiceTimingOverride: row.allowInvoiceTimingOverride === '1',
    allowDepositPerEvent: row.allowDepositPerEvent === '1',
    allowDepositPerItem: row.allowDepositPerItem === '1',
    defaultDepositMode: deposit,
    defaultEventDepositAmount: Number(row.defaultEventDepositAmount).toFixed(2),
    defaultEventDepositPercent: Number(row.defaultEventDepositPercent).toFixed(2),
    overlapPolicy: overlap,
    defaultTurnaroundHours: Math.max(0, row.defaultTurnaroundHours ?? 0),
    defaultLateFeePerDay: Number(row.defaultLateFeePerDay ?? 0).toFixed(2),
  };
}

export function suggestedEventDeposit(params: {
  mode: DepositMode;
  eventAmount: number;
  eventPercent: number;
  hireTotal: number;
  itemDeposits: number;
}): number {
  const eventFlat = Math.max(0, params.eventAmount);
  const eventPct = Math.max(0, (params.hireTotal * params.eventPercent) / 100);
  const eventPart = Math.max(eventFlat, eventPct);
  if (params.mode === 'none') return 0;
  if (params.mode === 'per_event') return Math.round(eventPart * 100) / 100;
  if (params.mode === 'per_item') return Math.round(Math.max(0, params.itemDeposits) * 100) / 100;
  return Math.round((eventPart + Math.max(0, params.itemDeposits)) * 100) / 100;
}

export function daysOverdue(hireTo: string, onDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireTo) || !/^\d{4}-\d{2}-\d{2}$/.test(onDate)) return 0;
  if (onDate <= hireTo) return 0;
  const ms = Date.parse(`${onDate}T12:00:00`) - Date.parse(`${hireTo}T12:00:00`);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}
