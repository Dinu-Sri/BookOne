/**
 * Tell websites that BookOne products or stock changed (Commerce WP1, G10).
 * Runs after the business transaction has committed; a failure here is logged
 * and never undoes or blocks the sale, stock move or product edit.
 */
export async function notifyCommerce(
  tenantId: string,
  productIds: Array<string | null | undefined>,
  kind: 'product' | 'inventory',
): Promise<void> {
  const ids = [...new Set(productIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  try {
    const { withCommerceService } = await import('@/lib/commerce-runtime');
    await withCommerceService(tenantId, (service) => service.notifyProductsChanged(tenantId, ids, kind));
  } catch (error) {
    console.error('[commerce] change notification failed:', error instanceof Error ? error.message : error);
  }
}
