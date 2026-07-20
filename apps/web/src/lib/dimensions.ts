import {
  and,
  brands,
  db,
  eq,
  isNull,
  locations,
  withTenantContext,
} from '@bookone/db';

export type DimOption = { id: string; name: string; code: string | null; brandId?: string | null };

/**
 * Resolve brand + location for a posting/document.
 * - If the company has brands configured, brand is required.
 * - If the company has locations configured, location is required.
 * - If only location is provided and it is linked to a brand, brand can be inferred.
 */
export async function resolveDimensions(
  tenantId: string,
  brandId?: string | null,
  locationId?: string | null,
): Promise<{ brandId: string | null; locationId: string | null }> {
  return withTenantContext(tenantId, async () => {
    const brandRows = await db()
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.tenantId, tenantId), isNull(brands.voidedAt)));

    const locationRows = await db()
      .select({ id: locations.id, brandId: locations.brandId })
      .from(locations)
      .where(and(eq(locations.tenantId, tenantId), isNull(locations.voidedAt)));

    let resolvedBrand = brandId || null;
    let resolvedLocation = locationId || null;

    if (resolvedLocation) {
      const loc = locationRows.find((l) => l.id === resolvedLocation);
      if (!loc) throw new Error('Selected location does not belong to this company.');
      if (!resolvedBrand && loc.brandId) resolvedBrand = loc.brandId;
    }

    if (brandRows.length > 0 && !resolvedBrand) {
      throw new Error('Select a brand for this entry.');
    }
    if (locationRows.length > 0 && !resolvedLocation) {
      throw new Error('Select a location for this entry.');
    }
    if (resolvedBrand && !brandRows.some((b) => b.id === resolvedBrand)) {
      throw new Error('Selected brand does not belong to this company.');
    }

    return {
      brandId: resolvedBrand,
      locationId: resolvedLocation,
    };
  });
}
