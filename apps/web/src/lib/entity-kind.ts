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
  rental: boolean;
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
  opts?: {
    /**
     * After downgrade from full: keep inventory/pos module flags true so history
     * stays visible (read-only). Writes still require capability full.
     */
    preserveAdvancedView?: boolean;
  },
): TenantModulesShape {
  if (entityKind === 'personal' || entityKind === 'pending') {
    return { sales: false, purchase: false, inventory: false, pos: false, rental: false, hr: false };
  }
  if (entityKind === 'sole_prop') {
    if (capability === 'full') {
      return { sales: true, purchase: true, inventory: true, pos: true, rental: true, hr: false };
    }
    // lite: sales/purchase on; inventory/pos only if preserving view after downgrade
    return {
      sales: true,
      purchase: true,
      inventory: !!opts?.preserveAdvancedView,
      pos: !!opts?.preserveAdvancedView,
      rental: false,
      hr: false,
    };
  }
  // company — starter-like defaults
  return { sales: true, purchase: true, inventory: false, pos: false, rental: false, hr: false };
}

export type ModuleWriteKey = 'sales' | 'purchase' | 'inventory' | 'pos' | 'rental' | 'hr';

/**
 * May open the module in the nav (including read-only after downgrade).
 */
export function canViewModule(
  entityKind: EntityKind,
  modules: Partial<Record<ModuleWriteKey, boolean>> | null | undefined,
  module: ModuleWriteKey,
): boolean {
  if (entityKind === 'personal' || entityKind === 'pending') return false;
  return Boolean(modules?.[module]);
}

/**
 * May create/edit in the module. Sole lite cannot write inventory/POS even if
 * those flags remain true for viewing historical data.
 */
export function canWriteModule(
  entityKind: EntityKind,
  capabilityTier: string | null | undefined,
  modules: Partial<Record<ModuleWriteKey, boolean>> | null | undefined,
  module: ModuleWriteKey,
): boolean {
  if (!canViewModule(entityKind, modules, module)) return false;
  if (entityKind === 'sole_prop' && (module === 'inventory' || module === 'pos')) {
    return canAccessFullErp(entityKind, capabilityTier);
  }
  return true;
}

/** Sole was full (or still has advanced flags) but is now lite → view-only advanced. */
export function hasReadOnlyAdvancedModules(
  entityKind: EntityKind,
  capabilityTier: string | null | undefined,
  modules: Partial<Record<ModuleWriteKey, boolean>> | null | undefined,
): boolean {
  if (entityKind !== 'sole_prop') return false;
  if (canAccessFullErp(entityKind, capabilityTier)) return false;
  return Boolean(modules?.inventory || modules?.pos);
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

/**
 * Full ERP chrome (sidebar suites, advanced company tools).
 * Personal never; sole_prop only when capability is full; company always.
 */
export function canAccessFullErp(
  entityKind: EntityKind,
  capabilityTier?: string | null,
): boolean {
  if (entityKind === 'company') return true;
  if (entityKind === 'sole_prop') {
    return String(capabilityTier ?? 'lite').toLowerCase() === 'full';
  }
  return false;
}

/** Default post-login / post-onboarding home path. */
export function homePathForEntity(
  entityKind: EntityKind,
  capabilityTier?: string | null,
): string {
  if (entityKind === 'pending') return '/onboarding';
  // Personal + sole lite → cashbook. Sole full defaults to cashbook too
  // (domain switcher); full ERP remains available via advanced link → `/`.
  if (usesPersonalShell(entityKind)) return '/cashbook';
  return '/';
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
