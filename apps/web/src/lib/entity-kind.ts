/**
 * Entity tier helpers — personal | sole_prop | company.
 * @see docs/ENTITY_TIERS_AND_TAX_ARCHITECTURE.md
 */

export type EntityKind = 'personal' | 'sole_prop' | 'company' | 'pending';
export type CapabilityTier = 'lite' | 'full';
export type BookDomain = 'personal' | 'business';

export type TenantModulesShape = {
  sales: boolean;
  purchase: boolean;
  inventory: boolean;
  pos: boolean;
  hr: boolean;
};

export function parseEntityKind(raw: unknown): EntityKind {
  const v = String(raw ?? 'company').toLowerCase();
  if (v === 'personal' || v === 'sole_prop' || v === 'company' || v === 'pending') return v;
  return 'company';
}

export function modulesForEntityKind(
  entityKind: EntityKind,
  capability: CapabilityTier = 'lite',
): TenantModulesShape {
  if (entityKind === 'personal' || entityKind === 'pending') {
    return { sales: false, purchase: false, inventory: false, pos: false, hr: false };
  }
  if (entityKind === 'sole_prop') {
    if (capability === 'full') {
      return { sales: true, purchase: true, inventory: true, pos: true, hr: false };
    }
    // lite: basic sales/purchase language; inventory/pos off
    return { sales: true, purchase: true, inventory: false, pos: false, hr: false };
  }
  // company — starter-like defaults
  return { sales: true, purchase: true, inventory: false, pos: false, hr: false };
}

export function defaultBookDomain(entityKind: EntityKind): BookDomain {
  if (entityKind === 'personal' || entityKind === 'pending') return 'personal';
  return 'business';
}

export function resolveBookDomain(
  entityKind: EntityKind,
  requested?: BookDomain | null,
): BookDomain {
  if (entityKind === 'personal' || entityKind === 'pending') return 'personal';
  if (entityKind === 'company') return 'business';
  // sole_prop
  if (requested === 'personal' || requested === 'business') return requested;
  return 'business';
}

export function usesPersonalShell(entityKind: EntityKind): boolean {
  return entityKind === 'personal' || entityKind === 'sole_prop';
}

export function needsOnboarding(entityKind: EntityKind): boolean {
  return entityKind === 'pending';
}

export function displayNameForEntity(
  entityKind: EntityKind,
  personName: string,
): string {
  const base = personName.trim() || 'My';
  if (entityKind === 'personal') return `${base}'s Personal`;
  if (entityKind === 'sole_prop') return `${base}'s Business`;
  return `${base}'s Company`;
}
