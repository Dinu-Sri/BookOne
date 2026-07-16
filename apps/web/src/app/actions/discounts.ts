'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import { auditLog, db, eq, and, isNull, desc, salesDiscounts, withTenantContext } from '@bookone/db';

const discountSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(40).optional(),
  discountType: z.enum(['percent', 'fixed']).default('percent'),
  value: z.number().positive(),
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
    }));
  });
}

export async function createDiscountFromForm(formData: FormData): Promise<void> {
  const parsed = discountSchema.parse({
    name: String(formData.get('name') ?? ''),
    code: String(formData.get('code') ?? ''),
    discountType: String(formData.get('discountType') ?? 'percent'),
    value: Number(String(formData.get('value') ?? '0').replace(/[^0-9.-]/g, '')) || 0,
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

  revalidatePath('/sales/discounts');
  const { redirect } = await import('next/navigation');
  redirect('/sales/discounts');
}
