'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import { and, db, eq, isNull, posRegisters, withTenantContext } from '@bookone/db';

export interface PosRegisterRow {
  id: string;
  code: string;
  name: string;
  printMode: string;
  thermalDeviceHint: string | null;
  receiptFooter: string | null;
  defaultPaymentAccountCode: string;
  isActive: boolean;
  sortOrder: number;
}

const registerSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  printMode: z.enum(['browser', 'thermal', 'both']),
  thermalDeviceHint: z.string().max(255).optional(),
  receiptFooter: z.string().max(2000).optional(),
  defaultPaymentAccountCode: z.string().max(20).default('1000'),
  isActive: z.boolean().default(true),
});

export async function listPosRegisters(): Promise<PosRegisterRow[]> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select()
      .from(posRegisters)
      .where(and(eq(posRegisters.tenantId, user.tenantId), isNull(posRegisters.voidedAt)))
      .orderBy(posRegisters.sortOrder, posRegisters.code);

    // Ensure at least one default register (migration seeds; this is a safety net)
    if (rows.length === 0) {
      const [created] = await db()
        .insert(posRegisters)
        .values({
          tenantId: user.tenantId,
          code: 'REG-01',
          name: 'Main counter',
          printMode: 'browser',
          isActive: '1',
          sortOrder: 0,
        })
        .returning();
      return [
        {
          id: created.id,
          code: created.code,
          name: created.name,
          printMode: created.printMode,
          thermalDeviceHint: created.thermalDeviceHint,
          receiptFooter: created.receiptFooter,
          defaultPaymentAccountCode: created.defaultPaymentAccountCode,
          isActive: true,
          sortOrder: created.sortOrder,
        },
      ];
    }

    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      printMode: r.printMode,
      thermalDeviceHint: r.thermalDeviceHint,
      receiptFooter: r.receiptFooter,
      defaultPaymentAccountCode: r.defaultPaymentAccountCode,
      isActive: r.isActive === '1',
      sortOrder: r.sortOrder,
    }));
  });
}

export async function savePosRegisterFromForm(formData: FormData): Promise<void> {
  const parsed = registerSchema.parse({
    id: String(formData.get('id') ?? '') || undefined,
    code: String(formData.get('code') ?? '').trim().toUpperCase(),
    name: String(formData.get('name') ?? '').trim(),
    printMode: String(formData.get('printMode') ?? 'browser'),
    thermalDeviceHint: String(formData.get('thermalDeviceHint') ?? ''),
    receiptFooter: String(formData.get('receiptFooter') ?? ''),
    defaultPaymentAccountCode: String(formData.get('defaultPaymentAccountCode') ?? '1000') || '1000',
    isActive: formData.get('isActive') === 'on' || formData.get('isActive') === '1',
  });

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    const values = {
      tenantId: user.tenantId,
      code: parsed.code,
      name: parsed.name,
      printMode: parsed.printMode,
      thermalDeviceHint: parsed.thermalDeviceHint?.trim() || null,
      receiptFooter: parsed.receiptFooter?.trim() || null,
      defaultPaymentAccountCode: parsed.defaultPaymentAccountCode,
      isActive: parsed.isActive ? '1' : '0',
      updatedAt: new Date(),
    };

    if (parsed.id) {
      await db()
        .update(posRegisters)
        .set(values)
        .where(
          and(
            eq(posRegisters.tenantId, user.tenantId),
            eq(posRegisters.id, parsed.id),
            isNull(posRegisters.voidedAt),
          ),
        );
    } else {
      const existing = await db()
        .select({ id: posRegisters.id })
        .from(posRegisters)
        .where(and(eq(posRegisters.tenantId, user.tenantId), isNull(posRegisters.voidedAt)));
      await db().insert(posRegisters).values({
        ...values,
        sortOrder: existing.length,
      });
    }
  });

  revalidatePath('/company/sales');
  revalidatePath('/pos');
  revalidatePath('/sales/pos');
  const { redirect } = await import('next/navigation');
  redirect('/company/sales?flash=saved#pos-registers');
}

export async function archivePosRegisterFromForm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Register id required.');

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    const active = await db()
      .select({ id: posRegisters.id })
      .from(posRegisters)
      .where(
        and(
          eq(posRegisters.tenantId, user.tenantId),
          eq(posRegisters.isActive, '1'),
          isNull(posRegisters.voidedAt),
        ),
      );
    if (active.length <= 1 && active[0]?.id === id) {
      throw new Error('Keep at least one active register.');
    }
    await db()
      .update(posRegisters)
      .set({ voidedAt: new Date(), isActive: '0', updatedAt: new Date() })
      .where(and(eq(posRegisters.tenantId, user.tenantId), eq(posRegisters.id, id)));
  });

  revalidatePath('/company/sales');
  const { redirect } = await import('next/navigation');
  redirect('/company/sales?flash=saved#pos-registers');
}
