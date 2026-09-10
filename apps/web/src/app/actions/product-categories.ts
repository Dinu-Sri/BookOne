'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@bookone/auth';
import {
  and,
  auditLog,
  db,
  eq,
  isNull,
  sql,
  inventoryProductCategories,
  inventoryProducts,
  withTenantContext,
} from '@bookone/db';
import { assertModuleWrite } from '@/lib/module-access';

export type ProductCategoryRow = {
  id: string;
  name: string;
  productCount: number;
};

function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 120);
}

function revalidateCategories() {
  revalidatePath('/inventory/categories');
  revalidatePath('/inventory/products');
  revalidatePath('/inventory/products/new');
}

export async function listProductCategories(): Promise<ProductCategoryRow[]> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        id: inventoryProductCategories.id,
        name: inventoryProductCategories.name,
      })
      .from(inventoryProductCategories)
      .where(
        and(eq(inventoryProductCategories.tenantId, user.tenantId), isNull(inventoryProductCategories.voidedAt)),
      )
      .orderBy(inventoryProductCategories.name);

    const counts = await db()
      .select({
        name: inventoryProducts.category,
        total: sql<number>`count(*)`,
      })
      .from(inventoryProducts)
      .where(and(eq(inventoryProducts.tenantId, user.tenantId), isNull(inventoryProducts.voidedAt)))
      .groupBy(inventoryProducts.category);
    const countMap = new Map(
      counts.filter((c) => c.name).map((c) => [c.name!.toLowerCase(), Number(c.total ?? 0)]),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      productCount: countMap.get(r.name.toLowerCase()) ?? 0,
    }));
  });
}

export async function createProductCategory(name: string): Promise<{ ok: boolean; name?: string; error?: string }> {
  const user = await requireTenantContext();
  await assertModuleWrite('inventory');
  const cleaned = cleanName(name);
  if (!cleaned) return { ok: false, error: 'Enter a category name.' };

  try {
    await withTenantContext(user.tenantId, async () => {
      const [dup] = await db()
        .select({ id: inventoryProductCategories.id })
        .from(inventoryProductCategories)
        .where(
          and(
            eq(inventoryProductCategories.tenantId, user.tenantId),
            sql`lower(${inventoryProductCategories.name}) = lower(${cleaned})`,
            isNull(inventoryProductCategories.voidedAt),
          ),
        )
        .limit(1);
      if (dup) throw new Error('DUPLICATE_NAME');

      const [created] = await db()
        .insert(inventoryProductCategories)
        .values({ tenantId: user.tenantId, name: cleaned })
        .returning({ id: inventoryProductCategories.id, name: inventoryProductCategories.name });

      await db().insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'CREATE',
        tableName: 'inventory_product_categories',
        recordId: created.id,
        newValues: { name: created.name },
        notes: 'Created product category.',
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DUPLICATE_NAME') {
      return { ok: false, error: 'That category already exists.' };
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save category.' };
  }

  revalidateCategories();
  return { ok: true, name: cleaned };
}

export async function createProductCategoryFromForm(
  _state: { ok: boolean; error?: string; message?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const result = await createProductCategory(String(formData.get('name') ?? ''));
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: 'Category added.' };
}

export async function renameProductCategoryFromForm(
  _state: { ok: boolean; error?: string; message?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const user = await requireTenantContext();
  await assertModuleWrite('inventory');
  const id = String(formData.get('id') ?? '').trim();
  const cleaned = cleanName(String(formData.get('name') ?? ''));
  if (!id || !cleaned) return { ok: false, error: 'Enter a category name.' };

  try {
    await withTenantContext(user.tenantId, async () => {
      const [existing] = await db()
        .select({ id: inventoryProductCategories.id, name: inventoryProductCategories.name })
        .from(inventoryProductCategories)
        .where(
          and(
            eq(inventoryProductCategories.tenantId, user.tenantId),
            eq(inventoryProductCategories.id, id),
            isNull(inventoryProductCategories.voidedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new Error('Category was not found.');

      const [dup] = await db()
        .select({ id: inventoryProductCategories.id })
        .from(inventoryProductCategories)
        .where(
          and(
            eq(inventoryProductCategories.tenantId, user.tenantId),
            sql`lower(${inventoryProductCategories.name}) = lower(${cleaned})`,
            isNull(inventoryProductCategories.voidedAt),
            sql`${inventoryProductCategories.id} <> ${id}`,
          ),
        )
        .limit(1);
      if (dup) throw new Error('DUPLICATE_NAME');

      await db()
        .update(inventoryProductCategories)
        .set({ name: cleaned, updatedAt: new Date() })
        .where(eq(inventoryProductCategories.id, id));

      if (existing.name !== cleaned) {
        await db()
          .update(inventoryProducts)
          .set({ category: cleaned, updatedAt: new Date() })
          .where(
            and(
              eq(inventoryProducts.tenantId, user.tenantId),
              eq(inventoryProducts.category, existing.name),
              isNull(inventoryProducts.voidedAt),
            ),
          );
      }

      await db().insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'UPDATE',
        tableName: 'inventory_product_categories',
        recordId: id,
        oldValues: { name: existing.name },
        newValues: { name: cleaned },
        notes: 'Renamed product category.',
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DUPLICATE_NAME') {
      return { ok: false, error: 'That category already exists.' };
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save category.' };
  }

  revalidateCategories();
  return { ok: true, message: 'Category updated.' };
}

export async function getCategoryDeleteBlockers(id: string): Promise<{ ok: boolean; reasons: string[] }> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const [existing] = await db()
      .select({ id: inventoryProductCategories.id, name: inventoryProductCategories.name })
      .from(inventoryProductCategories)
      .where(
        and(
          eq(inventoryProductCategories.tenantId, user.tenantId),
          eq(inventoryProductCategories.id, id),
          isNull(inventoryProductCategories.voidedAt),
        ),
      )
      .limit(1);
    if (!existing) return { ok: false, reasons: ['Category not found.'] };

    const [used] = await db()
      .select({ total: sql<number>`count(*)` })
      .from(inventoryProducts)
      .where(
        and(
          eq(inventoryProducts.tenantId, user.tenantId),
          eq(inventoryProducts.category, existing.name),
          isNull(inventoryProducts.voidedAt),
        ),
      );
    const n = Number(used?.total ?? 0);
    if (n > 0) return { ok: false, reasons: [`Used on ${n} product(s). Move those products first.`] };
    return { ok: true, reasons: [] };
  });
}

export async function deleteProductCategoryFromForm(formData: FormData): Promise<void> {
  const user = await requireTenantContext();
  await assertModuleWrite('inventory');
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('Category not found.');

  await withTenantContext(user.tenantId, async () => {
    const blockers = await getCategoryDeleteBlockers(id);
    if (!blockers.ok) throw new Error(`Cannot delete: ${blockers.reasons.join(' ')}`);

    const [existing] = await db()
      .select({ id: inventoryProductCategories.id, name: inventoryProductCategories.name })
      .from(inventoryProductCategories)
      .where(and(eq(inventoryProductCategories.tenantId, user.tenantId), eq(inventoryProductCategories.id, id)))
      .limit(1);
    if (!existing) throw new Error('Category not found.');

    await db()
      .update(inventoryProductCategories)
      .set({ voidedAt: new Date(), updatedAt: new Date() })
      .where(eq(inventoryProductCategories.id, id));

    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'DELETE',
      tableName: 'inventory_product_categories',
      recordId: id,
      oldValues: { name: existing.name },
      notes: 'Soft-voided product category (not in use).',
    });
  });

  revalidateCategories();
}
