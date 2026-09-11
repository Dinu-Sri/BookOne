export type DimensionScope = {
  /** null = every location */
  locationIds: string[] | null;
  /** null = every brand */
  brandIds: string[] | null;
};

export function unrestrictedDimensionScope(): DimensionScope {
  return { locationIds: null, brandIds: null };
}

export function isUnrestrictedScope(scope: DimensionScope | null | undefined): boolean {
  return !scope?.locationIds && !scope?.brandIds;
}

/** Null document dimensions stay visible. Set dimensions must match the allowed lists. */
export function inDimensionScope(
  scope: DimensionScope | null | undefined,
  dims: { locationId?: string | null; brandId?: string | null },
): boolean {
  if (!scope) return true;
  if (scope.locationIds && dims.locationId && !scope.locationIds.includes(dims.locationId)) return false;
  if (scope.brandIds && dims.brandId && !scope.brandIds.includes(dims.brandId)) return false;
  return true;
}

export function scopeIgnoresJob(templateKey: string | null | undefined): boolean {
  const key = (templateKey ?? '').toLowerCase();
  return key === 'owner' || key === 'admin';
}
