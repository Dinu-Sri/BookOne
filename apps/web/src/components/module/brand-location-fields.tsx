'use client';

import { useMemo, useState } from 'react';

export type BrandOption = { id: string; name: string; code: string | null };
export type LocationOption = {
  id: string;
  name: string;
  code: string | null;
  brandId?: string | null;
};

/**
 * Brand + location selectors for commercial documents.
 * Shown only when the company has configured brands and/or locations.
 * Required when options exist (matches Simple Entry behaviour).
 */
export function BrandLocationFields({
  brands = [],
  locations = [],
  defaultBrandId = '',
  defaultLocationId = '',
}: {
  brands?: BrandOption[];
  locations?: LocationOption[];
  defaultBrandId?: string;
  defaultLocationId?: string;
}) {
  const hasBrands = brands.length > 0;
  const hasLocations = locations.length > 0;
  if (!hasBrands && !hasLocations) return null;

  const initialBrand =
    defaultBrandId ||
    (brands.length === 1 ? brands[0]!.id : '') ||
    (defaultLocationId
      ? locations.find((l) => l.id === defaultLocationId)?.brandId ?? ''
      : '');
  const initialLoc =
    defaultLocationId || (locations.length === 1 ? locations[0]!.id : '');

  const [brandId, setBrandId] = useState(initialBrand);
  const [locationId, setLocationId] = useState(initialLoc);

  const filteredLocations = useMemo(() => {
    if (!brandId || !hasBrands) return locations;
    const linked = locations.filter((l) => !l.brandId || l.brandId === brandId);
    return linked.length > 0 ? linked : locations;
  }, [locations, brandId, hasBrands]);

  return (
    <>
      {hasBrands ? (
        <div className="field">
          <label>Brand *</label>
          <select
            className="input"
            name="brandId"
            required
            value={brandId}
            onChange={(e) => {
              const next = e.target.value;
              setBrandId(next);
              // Clear location if it no longer matches brand
              if (locationId) {
                const loc = locations.find((l) => l.id === locationId);
                if (loc?.brandId && loc.brandId !== next) setLocationId('');
              }
            }}
          >
            <option value="">Select brand…</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code ? `${b.code} — ` : ''}
                {b.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {hasLocations ? (
        <div className="field">
          <label>Location *</label>
          <select
            className="input"
            name="locationId"
            required
            value={locationId}
            onChange={(e) => {
              const next = e.target.value;
              setLocationId(next);
              const loc = locations.find((l) => l.id === next);
              if (loc?.brandId && hasBrands) setBrandId(loc.brandId);
            }}
          >
            <option value="">Select location…</option>
            {filteredLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.code ? `${loc.code} — ` : ''}
                {loc.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </>
  );
}
