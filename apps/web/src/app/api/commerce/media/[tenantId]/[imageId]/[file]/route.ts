import { NextRequest, NextResponse } from 'next/server';
import { and, db, eq, inventoryProductImages, inventoryProducts, isNull, withTenantContext } from '@bookone/db';
import { readStoredImage } from '@/lib/product-image';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public product image for websites (Commerce WP1). No key needed: product
 * photos are public merchandising. The last path segment carries the checksum,
 * so a changed image gets a new URL and the response can be cached for a year.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ tenantId: string; imageId: string; file: string }> }) {
  const { tenantId, imageId } = await ctx.params;
  if (!UUID.test(tenantId)) return new NextResponse('Not found', { status: 404 });
  const key = await withTenantContext(tenantId, async () => {
    if (imageId.startsWith('p_')) {
      const productId = imageId.slice(2);
      if (!UUID.test(productId)) return null;
      const [row] = await db()
        .select({ key: inventoryProducts.imageKey })
        .from(inventoryProducts)
        .where(and(eq(inventoryProducts.tenantId, tenantId), eq(inventoryProducts.id, productId), isNull(inventoryProducts.voidedAt)))
        .limit(1);
      return row?.key ?? null;
    }
    if (!UUID.test(imageId)) return null;
    const [row] = await db()
      .select({ key: inventoryProductImages.storageKey })
      .from(inventoryProductImages)
      .where(
        and(
          eq(inventoryProductImages.tenantId, tenantId),
          eq(inventoryProductImages.id, imageId),
          isNull(inventoryProductImages.voidedAt),
        ),
      )
      .limit(1);
    return row?.key ?? null;
  }).catch(() => null);
  if (!key) return new NextResponse('Not found', { status: 404 });
  if (key.startsWith('tenants/') && !key.startsWith(`tenants/${tenantId}/`)) return new NextResponse('Not found', { status: 404 });
  const bytes = await readStoredImage(key);
  if (!bytes) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
