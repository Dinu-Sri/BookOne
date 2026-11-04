/** Virtual fleet bays — not pickable on sales/purchase documents. */
export const FLEET_LOCATION_TYPES = ['on_rent', 'repair', 'wash'] as const;
export type FleetLocationType = (typeof FLEET_LOCATION_TYPES)[number];

export const OPERATIONAL_LOCATION_TYPES = ['branch', 'warehouse', 'counter', 'office'] as const;
export type OperationalLocationType = (typeof OPERATIONAL_LOCATION_TYPES)[number];

export const LOCATION_TYPE_LABELS: Record<string, string> = {
  branch: 'Branch',
  warehouse: 'Warehouse',
  counter: 'POS counter',
  office: 'Office',
  on_rent: 'On rent',
  repair: 'Repair',
  wash: 'Wash',
};

export const FLEET_BAY_DEFAULTS: Record<FleetLocationType, { name: string; code: string }> = {
  on_rent: { name: 'On rent', code: 'ON-RENT' },
  wash: { name: 'Wash', code: 'WASH' },
  repair: { name: 'Repair', code: 'REPAIR' },
};

export function isFleetLocationType(type?: string | null): type is FleetLocationType {
  return type === 'on_rent' || type === 'repair' || type === 'wash';
}

export function operationalLocations<T extends { locationType?: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !isFleetLocationType(r.locationType));
}

export function allowedLocationTypes(rentalModuleOn: boolean): string[] {
  return rentalModuleOn
    ? [...OPERATIONAL_LOCATION_TYPES, ...FLEET_LOCATION_TYPES]
    : [...OPERATIONAL_LOCATION_TYPES];
}

/** Fleet types require the Rental module. Existing fleet rows may keep their type on edit. */
export function isAllowedLocationType(
  type: string,
  rentalModuleOn: boolean,
  currentType?: string | null,
): boolean {
  if (allowedLocationTypes(rentalModuleOn).includes(type)) return true;
  return Boolean(currentType && type === currentType);
}
