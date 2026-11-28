'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import { db, eq, inventorySettings, withTenantContext } from '@bookone/db';
import { assertPermission } from '@/lib/access';
import { INVENTORY_SETTINGS_DEFAULTS, loadInventorySettings } from '@/lib/tenant-settings';

const schema = z.object({
  negativeStockPolicy: z.enum(['allow', 'block']),
  costingMethod: z.enum(['last', 'average', 'fifo']),
});

export interface InventorySettingsRow {
  negativeStockPolicy: 'allow' | 'block';
  costingMethod: 'last' | 'average' | 'fifo';
}

const DEFAULTS: InventorySettingsRow = INVENTORY_SETTINGS_DEFAULTS;

export async function getInventorySettings(): Promise<InventorySettingsRow> {
  const user = await requireTenantContext();
  return loadInventorySettings(user.tenantId);
}

export async function saveInventorySettingsFromForm(formData: FormData): Promise<void> {
  const parsed = schema.parse({
    negativeStockPolicy:
      String(formData.get('negativeStockPolicy') ?? 'allow') === 'block' ? 'block' : 'allow',
    costingMethod: ((): 'last' | 'average' | 'fifo' => {
      const v = String(formData.get('costingMethod') ?? 'last');
      if (v === 'average') return 'average';
      if (v === 'fifo') return 'fifo';
      return 'last';
    })(),
  });

  const user = await requireTenantContext();
  await assertPermission('company.inventory_settings.write', 'write');
  await withTenantContext(user.tenantId, async () => {
    // One DB transaction (CoreGuard §4.2): the costing method and the FIFO cost layers it seeds commit together.
    await db().transaction(async () => {
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
      if (parsed.costingMethod === 'fifo') {
        const { seedAllProductLots } = await import('@/lib/inventory-costing');
        await seedAllProductLots(user.tenantId, new Date().toISOString().slice(0, 10));
      }
    });
  });

  revalidatePath('/company/inventory');
  revalidatePath('/inventory/products');
  revalidatePath('/sales/invoices');
  revalidatePath('/purchase/purchases');
  const { redirect } = await import('next/navigation');
  redirect('/company/inventory?flash=saved');
}
