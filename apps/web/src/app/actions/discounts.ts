'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import { auditLog, db, eq, and, isNull, desc, salesDiscounts, withTenantContext } from '@bookone/db';

const discountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  code: z.string().max(40).optional(),
  discountType: z.enum(['percent', 'fixed']).default('percent'),
  value: z.number().positive(),
  isActive: z.boolean().optional().default(true),
  startsOn: z.string().optional(),
  endsOn: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export interface DiscountRow {
  id: string;
  name: string;
  code: string | null;
  discountType: string;
  value: number;
  isActive: string;
  startsOn: string | null;
  endsOn: string | null;
  notes: string | null;
}

function revalidateDiscountPaths() {
  revalidatePath('/sales/discounts');
  revalidatePath('/sales/quotations');
  revalidatePath('/sales/orders');
  revalidatePath('/sales/invoices');
  revalidatePath('/sales/pos');
}

export async function listDiscounts(): Promise<DiscountRow[]> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select()
      .from(salesDiscounts)
      .where(and(eq(salesDiscounts.tenantId, user.tenantId), isNull(salesDiscounts.voidedAt)))
      .orderBy(desc(salesDiscounts.createdAt));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      discountType: r.discountType,
      value: Number(r.value),
      isActive: r.isActive,
      startsOn: r.startsOn,
      endsOn: r.endsOn,
      notes: r.notes,
    }));
  });
}

export async function getDiscount(id: string): Promise<DiscountRow | null> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const [r] = await db()
      .select()
      .from(salesDiscounts)
      .where(
        and(
          eq(salesDiscounts.tenantId, user.tenantId),
          eq(salesDiscounts.id, id),
          isNull(salesDiscounts.voidedAt),
        ),
      )
      .limit(1);
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      discountType: r.discountType,
      value: Number(r.value),
      isActive: r.isActive,
      startsOn: r.startsOn,
      endsOn: r.endsOn,
      notes: r.notes,
    };
  });
}

export async function createDiscountFromForm(formData: FormData): Promise<void> {
  const parsed = discountSchema.parse({
    name: String(formData.get('name') ?? ''),
    code: String(formData.get('code') ?? ''),
    discountType: String(formData.get('discountType') ?? 'percent'),
    value: Number(String(formData.get('value') ?? '0').replace(/[^0-9.-]/g, '')) || 0,
    isActive: formData.get('isActive') === 'on' || formData.get('isActive') === '1',
    startsOn: String(formData.get('startsOn') ?? ''),
    endsOn: String(formData.get('endsOn') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    const [row] = await db()
      .insert(salesDiscounts)
      .values({
        tenantId: user.tenantId,
        name: parsed.name.trim(),
        code: parsed.code?.trim() || null,
        discountType: parsed.discountType,
        value: parsed.value.toFixed(2),
        isActive: parsed.isActive ? '1' : '0',
        startsOn: parsed.startsOn || null,
        endsOn: parsed.endsOn || null,
        notes: parsed.notes || null,
      })
      .returning({ id: salesDiscounts.id });

    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'CREATE',
      tableName: 'sales_discounts',
      recordId: row.id,
      newValues: { name: parsed.name, value: parsed.value },
      notes: 'Created sales discount.',
    });
  });

  revalidateDiscountPaths();
  const { redirect } = await import('next/navigation');
  redirect('/sales/discounts?flash=saved');
}

export async function updateDiscountFromForm(formData: FormData): Promise<void> {
  const parsed = discountSchema.parse({
    id: String(formData.get('id') ?? ''),
    name: String(formData.get('name') ?? ''),
    code: String(formData.get('code') ?? ''),
    discountType: String(formData.get('discountType') ?? 'percent'),
    value: Number(String(formData.get('value') ?? '0').replace(/[^0-9.-]/g, '')) || 0,
    isActive: formData.get('isActive') === 'on' || formData.get('isActive') === '1',
    startsOn: String(formData.get('startsOn') ?? ''),
    endsOn: String(formData.get('endsOn') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });
  if (!parsed.id) throw new Error('Discount id required.');

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    await db()
      .update(salesDiscounts)
      .set({
        name: parsed.name.trim(),
        code: parsed.code?.trim() || null,
        discountType: parsed.discountType,
        value: parsed.value.toFixed(2),
        isActive: parsed.isActive ? '1' : '0',
        startsOn: parsed.startsOn || null,
        endsOn: parsed.endsOn || null,
        notes: parsed.notes || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(salesDiscounts.tenantId, user.tenantId),
          eq(salesDiscounts.id, parsed.id!),
          isNull(salesDiscounts.voidedAt),
        ),
      );

    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'UPDATE',
      tableName: 'sales_discounts',
      recordId: parsed.id!,
      newValues: { name: parsed.name, value: parsed.value },
      notes: 'Updated sales discount.',
    });
  });

  revalidateDiscountPaths();
  const { redirect } = await import('next/navigation');
  redirect('/sales/discounts?flash=saved');
}

export async function setDiscountActiveFromForm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const active = formData.get('active') === '1';
  if (!id) throw new Error('Discount id required.');

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    await db()
      .update(salesDiscounts)
      .set({ isActive: active ? '1' : '0', updatedAt: new Date() })
      .where(
        and(
          eq(salesDiscounts.tenantId, user.tenantId),
          eq(salesDiscounts.id, id),
          isNull(salesDiscounts.voidedAt),
        ),
      );
  });
  revalidateDiscountPaths();
}

export async function archiveDiscountFromForm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Discount id required.');

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    await db()
      .update(salesDiscounts)
      .set({ voidedAt: new Date(), isActive: '0', updatedAt: new Date() })
      .where(and(eq(salesDiscounts.tenantId, user.tenantId), eq(salesDiscounts.id, id)));

    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'DELETE',
      tableName: 'sales_discounts',
      recordId: id,
      notes: 'Archived sales discount.',
    });
  });
  revalidateDiscountPaths();
}
