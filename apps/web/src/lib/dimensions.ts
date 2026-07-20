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

export type ResolveDimensionsOpts = {
  /**
   * POS / automated suites: fill missing brand/location from register defaults,
   * single masters, or first active master so cashiers never pick brand on the till.
   */
  auto?: boolean;
};

/**
 * Resolve brand + location for a posting/document.
 * - If the company has brands configured, brand is required (unless auto can fill it).
 * - If the company has locations configured, location is required (unless auto can fill it).
 * - Location → brand is inferred when the location is linked to a brand.
 * - A single brand or location is always auto-selected when not provided.
 */
export async function resolveDimensions(
  tenantId: string,
  brandId?: string | null,
  locationId?: string | null,
  opts?: ResolveDimensionsOpts,
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

    // Single master → always fill (forms + POS)
    if (!resolvedBrand && brandRows.length === 1) resolvedBrand = brandRows[0]!.id;
    if (!resolvedLocation && locationRows.length === 1) resolvedLocation = locationRows[0]!.id;

    // Infer brand from location
    if (resolvedLocation) {
      const loc = locationRows.find((l) => l.id === resolvedLocation);
      if (!loc) throw new Error('Selected location does not belong to this company.');
      if (!resolvedBrand && loc.brandId) resolvedBrand = loc.brandId;
    }

    // POS / health-check: never block on missing UI field when masters exist
    if (opts?.auto) {
      if (!resolvedLocation && locationRows.length > 0) {
        resolvedLocation = locationRows[0]!.id;
      }
      if (resolvedLocation && !resolvedBrand) {
        const loc = locationRows.find((l) => l.id === resolvedLocation);
        if (loc?.brandId) resolvedBrand = loc.brandId;
      }
      if (!resolvedBrand && brandRows.length > 0) {
        resolvedBrand = brandRows[0]!.id;
      }
    }

    if (brandRows.length > 0 && !resolvedBrand) {
      throw new Error(
        'Select a brand for this entry. (POS: set a Location on the register and link that location to a Brand under Company.)',
      );
    }
    if (locationRows.length > 0 && !resolvedLocation) {
      throw new Error(
        'Select a location for this entry. (POS: assign a Location to the register under Company → Sales Settings.)',
      );
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
