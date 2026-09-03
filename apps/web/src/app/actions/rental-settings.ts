'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import { db, eq, rentalSettings, withTenantContext } from '@bookone/db';

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
};

const schema = z.object({
  allowHirePerEvent: z.boolean(),
  allowHirePerDay: z.boolean(),
  allowHirePerHour: z.boolean(),
  defaultHireUnit: z.enum(HIRE_UNITS),
  allowInvoiceOnConfirm: z.boolean(),
  allowInvoiceOnDispatch: z.boolean(),
  allowInvoiceAfterReturn: z.boolean(),
  allowInvoiceManual: z.boolean(),
  defaultInvoiceTiming: z.enum(INVOICE_TIMINGS),
  allowInvoiceTimingOverride: z.boolean(),
  allowDepositPerEvent: z.boolean(),
  allowDepositPerItem: z.boolean(),
  defaultDepositMode: z.enum(DEPOSIT_MODES),
  defaultEventDepositAmount: z.string(),
  defaultEventDepositPercent: z.string(),
  overlapPolicy: z.enum(OVERLAP_POLICIES),
  defaultTurnaroundHours: z.number().int().min(0).max(24 * 30),
});

function money(raw: string | null | undefined, fallback: string): string {
  const n = Number(String(raw ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n.toFixed(2);
}

function mapRow(row: {
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
  };
}

/** Coerce defaults so they always sit inside the enabled option set. */
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

function flag(v: boolean): '1' | '0' {
  return v ? '1' : '0';
}

export async function getRentalSettings(): Promise<RentalSettingsRow> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const [row] = await db()
      .select()
      .from(rentalSettings)
      .where(eq(rentalSettings.tenantId, user.tenantId))
      .limit(1);
    if (!row) return { ...DEFAULT_RENTAL_SETTINGS };
    return reconcileRentalSettings(mapRow(row));
  });
}

export async function saveRentalSettingsFromForm(formData: FormData): Promise<void> {
  const parsed = schema.parse({
    allowHirePerEvent: formData.get('allowHirePerEvent') === 'on',
    allowHirePerDay: formData.get('allowHirePerDay') === 'on',
    allowHirePerHour: formData.get('allowHirePerHour') === 'on',
    defaultHireUnit: String(formData.get('defaultHireUnit') ?? 'event'),
    allowInvoiceOnConfirm: formData.get('allowInvoiceOnConfirm') === 'on',
    allowInvoiceOnDispatch: formData.get('allowInvoiceOnDispatch') === 'on',
    allowInvoiceAfterReturn: formData.get('allowInvoiceAfterReturn') === 'on',
    allowInvoiceManual: formData.get('allowInvoiceManual') === 'on',
    defaultInvoiceTiming: String(formData.get('defaultInvoiceTiming') ?? 'on_confirm'),
    allowInvoiceTimingOverride: formData.get('allowInvoiceTimingOverride') === 'on',
    allowDepositPerEvent: formData.get('allowDepositPerEvent') === 'on',
    allowDepositPerItem: formData.get('allowDepositPerItem') === 'on',
    defaultDepositMode: String(formData.get('defaultDepositMode') ?? 'per_event'),
    defaultEventDepositAmount: money(String(formData.get('defaultEventDepositAmount')), '0.00'),
    defaultEventDepositPercent: money(String(formData.get('defaultEventDepositPercent')), '0.00'),
    overlapPolicy: String(formData.get('overlapPolicy') ?? 'override'),
    defaultTurnaroundHours: Math.max(0, parseInt(String(formData.get('defaultTurnaroundHours') ?? '0'), 10) || 0),
  });

  const reconciled = reconcileRentalSettings(parsed);

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    const [existing] = await db()
      .select({ id: rentalSettings.id })
      .from(rentalSettings)
      .where(eq(rentalSettings.tenantId, user.tenantId))
      .limit(1);

    const values = {
      allowHirePerEvent: flag(reconciled.allowHirePerEvent),
      allowHirePerDay: flag(reconciled.allowHirePerDay),
      allowHirePerHour: flag(reconciled.allowHirePerHour),
      defaultHireUnit: reconciled.defaultHireUnit,
      allowInvoiceOnConfirm: flag(reconciled.allowInvoiceOnConfirm),
      allowInvoiceOnDispatch: flag(reconciled.allowInvoiceOnDispatch),
      allowInvoiceAfterReturn: flag(reconciled.allowInvoiceAfterReturn),
      allowInvoiceManual: flag(reconciled.allowInvoiceManual),
      defaultInvoiceTiming: reconciled.defaultInvoiceTiming,
      allowInvoiceTimingOverride: flag(reconciled.allowInvoiceTimingOverride),
      allowDepositPerEvent: flag(reconciled.allowDepositPerEvent),
      allowDepositPerItem: flag(reconciled.allowDepositPerItem),
      defaultDepositMode: reconciled.defaultDepositMode,
      defaultEventDepositAmount: reconciled.defaultEventDepositAmount,
      defaultEventDepositPercent: reconciled.defaultEventDepositPercent,
      overlapPolicy: reconciled.overlapPolicy,
      defaultTurnaroundHours: reconciled.defaultTurnaroundHours,
      updatedAt: new Date(),
    };

    if (existing) {
      await db().update(rentalSettings).set(values).where(eq(rentalSettings.id, existing.id));
    } else {
      await db().insert(rentalSettings).values({ tenantId: user.tenantId, ...values });
    }
  });

  revalidatePath('/company/rental');
  const { redirect } = await import('next/navigation');
  redirect('/company/rental?flash=saved');
}
