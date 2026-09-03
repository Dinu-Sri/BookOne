/** Virtual fleet bays — not pickable on sales/purchase documents. */
export const FLEET_LOCATION_TYPES = ['on_rent', 'repair', 'wash'] as const;
export type FleetLocationType = (typeof FLEET_LOCATION_TYPES)[number];

export function isFleetLocationType(type?: string | null): boolean {
  return type === 'on_rent' || type === 'repair' || type === 'wash';
}

export function operationalLocations<T extends { locationType?: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !isFleetLocationType(r.locationType));
}
