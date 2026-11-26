'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@bookone/auth';
import {
  and,
  asc,
  db,
  eq,
  inventoryProductBrands,
  inventoryProductImages,
  inventoryProducts,
  isNull,
  sql,
  withTenantContext,
} from '@bookone/db';
import { assertModuleWrite } from '@/lib/module-access';
import { notifyCommerce, notifyCommerceTaxonomy } from '@/lib/commerce-notify';
import { formatAttributeValues, formatProductOptions, formatVariantOptions } from '@/lib/product-catalog-fields';

/** Commerce WP1: catalog fields, gallery images and product brands for the product form. */

export interface ProductCatalogEditor {
  values: {
    shortName: string;
    productBrandId: string;
    parentProductId: string;
    isParentListing: boolean;
    productOptions: string;
    variantOptions: string;
    swatchHex: string;
    variantSortOrder: string;
    isDefaultVariant: boolean;
    tags: string;
    extraBarcodes: string;
    attributeValues: string;
    weightGrams: string;
    lengthMm: string;
    widthMm: string;
    heightMm: string;
    fragile: boolean;
    minOrderQty: string;
    maxOrderQty: string;
    orderQtyStep: string;
    allowBackorder: boolean;
  };
  images: Array<{ id: string; url: string; width: number; height: number; alt: string | null; position: number }>;
  variants: Array<{ id: string; sku: string; name: string; options: string }>;
  parents: Array<{ id: string; sku: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
}

const EMPTY_VALUES: ProductCatalogEditor['values'] = {
  shortName: '',
  productBrandId: '',
  parentProductId: '',
  isParentListing: false,
  productOptions: '',
  variantOptions: '',
  swatchHex: '',
  variantSortOrder: '',
  isDefaultVariant: false,
  tags: '',
  extraBarcodes: '',
  attributeValues: '',
  weightGrams: '',
  lengthMm: '',
  widthMm: '',
  heightMm: '',
  fragile: false,
  minOrderQty: '',
  maxOrderQty: '',
  orderQtyStep: '',
  allowBackorder: false,
};

function num(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : '';
}

function joinList(v: unknown): string {
  return Array.isArray(v) ? v.map(String).join(', ') : '';
}

export async function getProductCatalogEditor(productId: string | null): Promise<ProductCatalogEditor> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const parents = await db()
      .select({ id: inventoryProducts.id, sku: inventoryProducts.sku, name: inventoryProducts.name })
      .from(inventoryProducts)
      .where(
        and(
          eq(inventoryProducts.tenantId, user.tenantId),
          isNull(inventoryProducts.voidedAt),
          isNull(inventoryProducts.parentProductId),
          sql`jsonb_array_length(${inventoryProducts.productOptions}) > 0`,
        ),
      )
      .orderBy(asc(inventoryProducts.name));
    const brands = await db()
      .select({ id: inventoryProductBrands.id, name: inventoryProductBrands.name })
      .from(inventoryProductBrands)
      .where(and(eq(inventoryProductBrands.tenantId, user.tenantId), isNull(inventoryProductBrands.voidedAt)))
      .orderBy(asc(inventoryProductBrands.name));
    if (!productId) return { values: EMPTY_VALUES, images: [], variants: [], parents, brands };
    const [p] = await db()
      .select()
      .from(inventoryProducts)
      .where(and(eq(inventoryProducts.tenantId, user.tenantId), eq(inventoryProducts.id, productId)))
      .limit(1);
    if (!p) return { values: EMPTY_VALUES, images: [], variants: [], parents, brands };
    const images = await db()
      .select()
      .from(inventoryProductImages)
      .where(
        and(
          eq(inventoryProductImages.tenantId, user.tenantId),
          eq(inventoryProductImages.productId, productId),
          isNull(inventoryProductImages.voidedAt),
        ),
      )
      .orderBy(asc(inventoryProductImages.position));
    const variants = await db()
      .select({ id: inventoryProducts.id, sku: inventoryProducts.sku, name: inventoryProducts.name, variantOptions: inventoryProducts.variantOptions })
      .from(inventoryProducts)
      .where(and(eq(inventoryProducts.tenantId, user.tenantId), eq(inventoryProducts.parentProductId, productId), isNull(inventoryProducts.voidedAt)))
      .orderBy(asc(inventoryProducts.variantSortOrder), asc(inventoryProducts.sku));
    const { resolveProductImageUrl } = await import('@/lib/product-image');
    return {
      values: {
        shortName: p.shortName ?? '',
        productBrandId: p.productBrandId ?? '',
        parentProductId: p.parentProductId ?? '',
        isParentListing: Array.isArray(p.productOptions) && (p.productOptions as unknown[]).length > 0,
        productOptions: formatProductOptions(p.productOptions),
        variantOptions: formatVariantOptions(p.variantOptions),
        swatchHex: p.swatchHex ?? '',
        variantSortOrder: p.variantSortOrder ? String(p.variantSortOrder) : '',
        isDefaultVariant: p.isDefaultVariant === '1',
        tags: joinList(p.tags),
        extraBarcodes: joinList(p.extraBarcodes),
        attributeValues: formatAttributeValues(p.attributeValues),
        weightGrams: num(p.weightGrams),
        lengthMm: num(p.lengthMm),
        widthMm: num(p.widthMm),
        heightMm: num(p.heightMm),
        fragile: p.fragile === '1',
        minOrderQty: num(p.minOrderQty),
        maxOrderQty: num(p.maxOrderQty),
        orderQtyStep: num(p.orderQtyStep),
        allowBackorder: p.allowBackorder === '1',
      },
      images: await Promise.all(
        images.map(async (img, i) => ({
          id: img.id,
          url: (await resolveProductImageUrl(img.storageKey, user.tenantId)) ?? '',
          width: img.width,
          height: img.height,
          alt: img.alt,
          position: i + 1,
        })),
      ),
      variants: variants.map((v) => ({ id: v.id, sku: v.sku, name: v.name, options: formatVariantOptions(v.variantOptions) })),
      parents: parents.filter((x) => x.id !== productId),
      brands,
    };
  });
}

async function productInTenant(tenantId: string, productId: string) {
  const [row] = await db()
    .select({ id: inventoryProducts.id, imageKey: inventoryProducts.imageKey })
    .from(inventoryProducts)
    .where(and(eq(inventoryProducts.tenantId, tenantId), eq(inventoryProducts.id, productId), isNull(inventoryProducts.voidedAt)))
    .limit(1);
  if (!row) throw new Error('Product not found.');
  return row;
}

function done(productId: string) {
  revalidatePath(`/inventory/products/${productId}`);
  revalidatePath('/inventory/products');
}

/** Upload one or more gallery images (originals up to 2000 px, WebP). The first becomes the POS photo when none is set. */
export async function uploadProductImagesFromForm(formData: FormData): Promise<{ ok: boolean; error?: string; added?: number }> {
  try {
    await assertModuleWrite('inventory');
    const user = await requireTenantContext();
    const productId = String(formData.get('productId') ?? '');
    const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return { ok: false, error: 'Choose at least one image.' };
    if (files.length > 12) return { ok: false, error: 'Upload at most 12 images at a time.' };
    const { saveProductGalleryImage, saveProductThumbWebp } = await import('@/lib/product-image');
    let added = 0;
    await withTenantContext(user.tenantId, async () => {
      const product = await productInTenant(user.tenantId, productId);
      const [{ max }] = await db()
        .select({ max: sql<number>`coalesce(max(${inventoryProductImages.position}), 0)` })
        .from(inventoryProductImages)
        .where(and(eq(inventoryProductImages.tenantId, user.tenantId), eq(inventoryProductImages.productId, productId), isNull(inventoryProductImages.voidedAt)));
      let position = Number(max ?? 0);
      let thumbSet = Boolean(product.imageKey);
      for (const file of files) {
        const saved = await saveProductGalleryImage({ tenantId: user.tenantId, productId, file });
        position += 1;
        await db().insert(inventoryProductImages).values({
          tenantId: user.tenantId,
          productId,
          storageKey: saved.storageKey,
          width: saved.width,
          height: saved.height,
          position,
          checksum: saved.checksum,
        });
        if (!thumbSet) {
          const { imageKey } = await saveProductThumbWebp({ tenantId: user.tenantId, productId, webp: saved.thumb });
          await db().update(inventoryProducts).set({ imageKey, updatedAt: new Date() }).where(eq(inventoryProducts.id, productId));
          thumbSet = true;
        }
        added += 1;
      }
      await db().update(inventoryProducts).set({ updatedAt: new Date() }).where(eq(inventoryProducts.id, productId));
    });
    await notifyCommerce(user.tenantId, [productId], 'image');
    done(productId);
    return { ok: true, added };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not upload the images.' };
  }
}

/** Move an image up or down, delete it, or change its alt text. */
export async function updateProductImageFromForm(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertModuleWrite('inventory');
    const user = await requireTenantContext();
    const productId = String(formData.get('productId') ?? '');
    const imageId = String(formData.get('imageId') ?? '');
    const op = String(formData.get('op') ?? '');
    await withTenantContext(user.tenantId, async () => {
      await productInTenant(user.tenantId, productId);
      const rows = await db()
        .select({ id: inventoryProductImages.id, position: inventoryProductImages.position })
        .from(inventoryProductImages)
        .where(and(eq(inventoryProductImages.tenantId, user.tenantId), eq(inventoryProductImages.productId, productId), isNull(inventoryProductImages.voidedAt)))
        .orderBy(asc(inventoryProductImages.position));
      const index = rows.findIndex((r) => r.id === imageId);
      if (index < 0) throw new Error('Image not found.');
      const now = new Date();
      if (op === 'delete') {
        await db().update(inventoryProductImages).set({ voidedAt: now, updatedAt: now }).where(eq(inventoryProductImages.id, imageId));
      } else if (op === 'up' || op === 'down' || op === 'first') {
        const order = rows.map((r) => r.id);
        const [moved] = order.splice(index, 1);
        const target = op === 'first' ? 0 : op === 'up' ? Math.max(0, index - 1) : Math.min(order.length, index + 1);
        order.splice(target, 0, moved!);
        for (let i = 0; i < order.length; i += 1) {
          await db().update(inventoryProductImages).set({ position: i + 1, updatedAt: now }).where(eq(inventoryProductImages.id, order[i]!));
        }
      } else if (op === 'alt') {
        const alt = String(formData.get('alt') ?? '').trim().slice(0, 255);
        await db().update(inventoryProductImages).set({ alt: alt || null, updatedAt: now }).where(eq(inventoryProductImages.id, imageId));
      } else {
        throw new Error('Unknown image action.');
      }
      await db().update(inventoryProducts).set({ updatedAt: now }).where(eq(inventoryProducts.id, productId));
    });
    await notifyCommerce(user.tenantId, [productId], 'image');
    done(productId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not update the image.' };
  }
}

export async function listProductBrands(): Promise<Array<{ id: string; name: string; websiteUrl: string | null; productCount: number }>> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        id: inventoryProductBrands.id,
        name: inventoryProductBrands.name,
        websiteUrl: inventoryProductBrands.websiteUrl,
        productCount: sql<number>`(select count(*) from inventory_products p where p.product_brand_id = ${inventoryProductBrands.id} and p.voided_at is null)`,
      })
      .from(inventoryProductBrands)
      .where(and(eq(inventoryProductBrands.tenantId, user.tenantId), isNull(inventoryProductBrands.voidedAt)))
      .orderBy(asc(inventoryProductBrands.name));
    return rows.map((r) => ({ ...r, productCount: Number(r.productCount ?? 0) }));
  });
}

export async function saveProductBrandFromForm(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertModuleWrite('inventory');
    const user = await requireTenantContext();
    const id = String(formData.get('id') ?? '');
    const name = String(formData.get('name') ?? '').trim().slice(0, 120);
    const websiteUrl = String(formData.get('websiteUrl') ?? '').trim().slice(0, 300);
    const description = String(formData.get('description') ?? '').trim().slice(0, 2000);
    const archive = formData.get('archive') === '1';
    if (!archive && name.length < 2) return { ok: false, error: 'Enter the brand name.' };
    if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) return { ok: false, error: 'Website must start with https:// or http://.' };
    let savedId = id;
    await withTenantContext(user.tenantId, async () => {
      if (id) {
        const set = archive
          ? { voidedAt: new Date(), updatedAt: new Date() }
          : { name, websiteUrl: websiteUrl || null, description: description || null, updatedAt: new Date() };
        await db()
          .update(inventoryProductBrands)
          .set(set)
          .where(and(eq(inventoryProductBrands.tenantId, user.tenantId), eq(inventoryProductBrands.id, id)));
        if (archive) {
          await db()
            .update(inventoryProducts)
            .set({ productBrandId: null, updatedAt: new Date() })
            .where(and(eq(inventoryProducts.tenantId, user.tenantId), eq(inventoryProducts.productBrandId, id)));
        }
      } else {
        const [dup] = await db()
          .select({ id: inventoryProductBrands.id })
          .from(inventoryProductBrands)
          .where(
            and(
              eq(inventoryProductBrands.tenantId, user.tenantId),
              sql`lower(${inventoryProductBrands.name}) = lower(${name})`,
              isNull(inventoryProductBrands.voidedAt),
            ),
          )
          .limit(1);
        if (dup) throw new Error('A brand with this name already exists.');
        const [created] = await db()
          .insert(inventoryProductBrands)
          .values({
            tenantId: user.tenantId,
            name,
            websiteUrl: websiteUrl || null,
            description: description || null,
          })
          .returning({ id: inventoryProductBrands.id });
        savedId = created?.id ?? '';
      }
    });
    revalidatePath('/inventory/categories');
    revalidatePath('/inventory/products');
    if (savedId) await notifyCommerceTaxonomy(user.tenantId, 'brand', savedId, archive ? 'deleted' : id ? 'updated' : 'created');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save the brand.' };
  }
}
