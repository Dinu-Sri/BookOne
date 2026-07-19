'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import { db, eq, inventorySettings, withTenantContext } from '@bookone/db';

const schema = z.object({
  negativeStockPolicy: z.enum(['allow', 'block']),
  costingMethod: z.enum(['last', 'average']),
});

export interface InventorySettingsRow {
  negativeStockPolicy: 'allow' | 'block';
  costingMethod: 'last' | 'average';
}

const DEFAULTS: InventorySettingsRow = {
  negativeStockPolicy: 'allow',
  costingMethod: 'last',
};

export async function getInventorySettings(): Promise<InventorySettingsRow> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const [row] = await db()
      .select()
      .from(inventorySettings)
      .where(eq(inventorySettings.tenantId, user.tenantId))
      .limit(1);
    if (!row) return { ...DEFAULTS };
    return {
      negativeStockPolicy:
        row.negativeStockPolicy === 'block' ? 'block' : 'allow',
      costingMethod: row.costingMethod === 'average' ? 'average' : 'last',
    };
  });
}

export async function saveInventorySettingsFromForm(formData: FormData): Promise<void> {
  const parsed = schema.parse({
    negativeStockPolicy:
      String(formData.get('negativeStockPolicy') ?? 'allow') === 'block' ? 'block' : 'allow',
    costingMethod:
      String(formData.get('costingMethod') ?? 'last') === 'average' ? 'average' : 'last',
  });

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    const [existing] = await db()
      .select({ id: inventorySettings.id })
      .from(inventorySettings)
      .where(eq(inventorySettings.tenantId, user.tenantId))
      .limit(1);

    const values = {
      negativeStockPolicy: parsed.negativeStockPolicy,
      costingMethod: parsed.costingMethod,
      updatedAt: new Date(),
    };

    if (existing) {
      await db().update(inventorySettings).set(values).where(eq(inventorySettings.id, existing.id));
    } else {
      await db().insert(inventorySettings).values({ tenantId: user.tenantId, ...values });
    }
  });

  revalidatePath('/company/inventory');
  revalidatePath('/inventory/products');
  revalidatePath('/sales/invoices');
  revalidatePath('/purchase/purchases');
  const { redirect } = await import('next/navigation');
  redirect('/company/inventory?flash=saved');
}
