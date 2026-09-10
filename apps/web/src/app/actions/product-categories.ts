'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@bookone/auth';
import {
  and,
  auditLog,
  brands,
  db,
  eq,
  isNull,
  sql,
  inventoryProductCategories,
  inventoryProducts,
  locations,
  withTenantContext,
} from '@bookone/db';
import { assertModuleWrite } from '@/lib/module-access';
import { sortCategoryTree } from '@/lib/product-category-display';

export type ProductCategoryRow = {
  id: string;
  name: string;
  slug: string | null;
  parentId: string | null;
  parentName: string | null;
  brandId: string | null;
  brandName: string | null;
  locationId: string | null;
  locationName: string | null;
  productCount: number;
  childCount: number;
};

function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 120);
}

function optionalId(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  return v ? v : null;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'category';
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
        slug: inventoryProductCategories.slug,
        parentId: inventoryProductCategories.parentId,
        brandId: inventoryProductCategories.brandId,
        locationId: inventoryProductCategories.locationId,
        brandName: brands.name,
        locationName: locations.name,
      })
      .from(inventoryProductCategories)
      .leftJoin(brands, eq(brands.id, inventoryProductCategories.brandId))
      .leftJoin(locations, eq(locations.id, inventoryProductCategories.locationId))
      .where(
        and(eq(inventoryProductCategories.tenantId, user.tenantId), isNull(inventoryProductCategories.voidedAt)),
      );

    const parentNameById = new Map(rows.map((r) => [r.id, r.name]));
    const childCountByParent = new Map<string, number>();
    for (const row of rows) {
      if (!row.parentId) continue;
      childCountByParent.set(row.parentId, (childCountByParent.get(row.parentId) ?? 0) + 1);
    }

    const counts = await db()
      .select({
        categoryId: inventoryProducts.categoryId,
        name: inventoryProducts.category,
        total: sql<number>`count(*)`,
      })
      .from(inventoryProducts)
      .where(and(eq(inventoryProducts.tenantId, user.tenantId), isNull(inventoryProducts.voidedAt)))
      .groupBy(inventoryProducts.categoryId, inventoryProducts.category);

    const byId = new Map<string, number>();
    const byName = new Map<string, number>();
    for (const c of counts) {
      const n = Number(c.total ?? 0);
      if (c.categoryId) byId.set(c.categoryId, (byId.get(c.categoryId) ?? 0) + n);
      if (c.name) byName.set(c.name.toLowerCase(), (byName.get(c.name.toLowerCase()) ?? 0) + n);
    }

    const mapped: ProductCategoryRow[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      parentId: r.parentId,
      parentName: r.parentId ? parentNameById.get(r.parentId) ?? null : null,
      brandId: r.brandId,
      brandName: r.brandName,
      locationId: r.locationId,
      locationName: r.locationName,
      productCount: byId.get(r.id) ?? byName.get(r.name.toLowerCase()) ?? 0,
      childCount: childCountByParent.get(r.id) ?? 0,
    }));
    return sortCategoryTree(mapped);
  });
}

async function assertUniqueScope(
  tenantId: string,
  cleaned: string,
  parentId: string | null,
  brandId: string | null,
  locationId: string | null,
  exceptId?: string,
) {
  const [dup] = await db()
    .select({ id: inventoryProductCategories.id })
    .from(inventoryProductCategories)
    .where(
      and(
        eq(inventoryProductCategories.tenantId, tenantId),
        sql`lower(${inventoryProductCategories.name}) = lower(${cleaned})`,
        parentId
          ? eq(inventoryProductCategories.parentId, parentId)
          : isNull(inventoryProductCategories.parentId),
        brandId ? eq(inventoryProductCategories.brandId, brandId) : isNull(inventoryProductCategories.brandId),
        locationId
          ? eq(inventoryProductCategories.locationId, locationId)
          : isNull(inventoryProductCategories.locationId),
        isNull(inventoryProductCategories.voidedAt),
        exceptId ? sql`${inventoryProductCategories.id} <> ${exceptId}` : sql`true`,
      ),
    )
    .limit(1);
  if (dup) throw new Error('DUPLICATE_NAME');
}

async function assertParentAllowed(tenantId: string, id: string | null, parentId: string | null) {
  if (!parentId) return;
  if (id && parentId === id) throw new Error('A category cannot be its own parent.');
  const [parent] = await db()
    .select({
      id: inventoryProductCategories.id,
      parentId: inventoryProductCategories.parentId,
    })
    .from(inventoryProductCategories)
    .where(
      and(
        eq(inventoryProductCategories.tenantId, tenantId),
        eq(inventoryProductCategories.id, parentId),
        isNull(inventoryProductCategories.voidedAt),
      ),
    )
    .limit(1);
  if (!parent) throw new Error('Parent category was not found.');
  if (parent.parentId) throw new Error('Choose a top-level parent. Child categories cannot have children (WordPress-style two levels).');
  if (id) {
    const [hasKids] = await db()
      .select({ total: sql<number>`count(*)` })
      .from(inventoryProductCategories)
      .where(
        and(
          eq(inventoryProductCategories.tenantId, tenantId),
          eq(inventoryProductCategories.parentId, id),
          isNull(inventoryProductCategories.voidedAt),
        ),
      );
    if (Number(hasKids?.total ?? 0) > 0) {
      throw new Error('Move or delete child categories before nesting this one.');
    }
  }
}

export async function createProductCategory(
  name: string,
  opts: { parentId?: string | null; brandId?: string | null; locationId?: string | null } = {},
): Promise<{ ok: boolean; name?: string; id?: string; error?: string }> {
  const user = await requireTenantContext();
  await assertModuleWrite('inventory');
  const cleaned = cleanName(name);
  if (!cleaned) return { ok: false, error: 'Enter a category name.' };
  const parentId = optionalId(opts.parentId);
  const brandId = optionalId(opts.brandId);
  const locationId = optionalId(opts.locationId);

  try {
    const created = await withTenantContext(user.tenantId, async () => {
      await assertParentAllowed(user.tenantId, null, parentId);
      await assertUniqueScope(user.tenantId, cleaned, parentId, brandId, locationId);
      const [row] = await db()
        .insert(inventoryProductCategories)
        .values({
          tenantId: user.tenantId,
          name: cleaned,
          slug: slugify(cleaned),
          parentId,
          brandId,
          locationId,
        })
        .returning({ id: inventoryProductCategories.id, name: inventoryProductCategories.name });

      await db().insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'CREATE',
        tableName: 'inventory_product_categories',
        recordId: row.id,
        newValues: { name: row.name, parentId, brandId, locationId },
        notes: 'Created product category.',
      });
      return row;
    });
    revalidateCategories();
    return { ok: true, name: created.name, id: created.id };
  } catch (error) {
    if (error instanceof Error && error.message === 'DUPLICATE_NAME') {
      return { ok: false, error: 'That category already exists in this group / brand / location.' };
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save category.' };
  }
}

function readScope(formData: FormData) {
  return {
    parentId: optionalId(String(formData.get('parentId') ?? '')),
    brandId: optionalId(String(formData.get('brandId') ?? '')),
    locationId: optionalId(String(formData.get('locationId') ?? '')),
  };
}

export async function createProductCategoryFromForm(
  _state: { ok: boolean; error?: string; message?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const scope = readScope(formData);
  const result = await createProductCategory(String(formData.get('name') ?? ''), scope);
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
  const scope = readScope(formData);

  try {
    await withTenantContext(user.tenantId, async () => {
      const [existing] = await db()
        .select({
          id: inventoryProductCategories.id,
          name: inventoryProductCategories.name,
        })
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

      await assertParentAllowed(user.tenantId, id, scope.parentId);
      await assertUniqueScope(user.tenantId, cleaned, scope.parentId, scope.brandId, scope.locationId, id);

      await db()
        .update(inventoryProductCategories)
        .set({
          name: cleaned,
          slug: slugify(cleaned),
          parentId: scope.parentId,
          brandId: scope.brandId,
          locationId: scope.locationId,
          updatedAt: new Date(),
        })
        .where(eq(inventoryProductCategories.id, id));

      if (existing.name !== cleaned) {
        await db()
          .update(inventoryProducts)
          .set({ category: cleaned, categoryId: id, updatedAt: new Date() })
          .where(
            and(
              eq(inventoryProducts.tenantId, user.tenantId),
              sql`(${inventoryProducts.categoryId} = ${id} or lower(coalesce(${inventoryProducts.category}, '')) = lower(${existing.name}))`,
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
        newValues: { name: cleaned, ...scope },
        notes: 'Updated product category.',
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DUPLICATE_NAME') {
      return { ok: false, error: 'That category already exists in this group / brand / location.' };
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

    const reasons: string[] = [];
    const [kids] = await db()
      .select({ total: sql<number>`count(*)` })
      .from(inventoryProductCategories)
      .where(
        and(
          eq(inventoryProductCategories.tenantId, user.tenantId),
          eq(inventoryProductCategories.parentId, id),
          isNull(inventoryProductCategories.voidedAt),
        ),
      );
    const childCount = Number(kids?.total ?? 0);
    if (childCount > 0) reasons.push(`Has ${childCount} child categor${childCount === 1 ? 'y' : 'ies'}. Move them first.`);

    const [used] = await db()
      .select({ total: sql<number>`count(*)` })
      .from(inventoryProducts)
      .where(
        and(
          eq(inventoryProducts.tenantId, user.tenantId),
          sql`(${inventoryProducts.categoryId} = ${id} or lower(coalesce(${inventoryProducts.category}, '')) = lower(${existing.name}))`,
          isNull(inventoryProducts.voidedAt),
        ),
      );
    const n = Number(used?.total ?? 0);
    if (n > 0) reasons.push(`Used on ${n} product(s). Move those products first.`);
    return { ok: reasons.length === 0, reasons };
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
