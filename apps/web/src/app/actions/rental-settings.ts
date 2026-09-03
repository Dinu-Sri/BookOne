'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import { db, eq, rentalSettings, withTenantContext } from '@bookone/db';
import {
  DEFAULT_RENTAL_SETTINGS,
  DEPOSIT_MODES,
  HIRE_UNITS,
  INVOICE_TIMINGS,
  OVERLAP_POLICIES,
  mapRentalSettingsRow,
  reconcileRentalSettings,
  type RentalSettingsRow,
} from '@/lib/rental-core';

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
    return reconcileRentalSettings(mapRentalSettingsRow(row));
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
