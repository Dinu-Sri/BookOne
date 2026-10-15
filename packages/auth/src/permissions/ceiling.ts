export type EntityKind = 'personal' | 'sole_prop' | 'company' | 'pending';
export type ModuleWriteKey = 'sales' | 'purchase' | 'inventory' | 'pos' | 'rental' | 'hr';

export function parseEntityKind(raw: unknown): EntityKind {
  const v = String(raw ?? 'company').toLowerCase();
  if (v === 'personal' || v === 'sole_prop' || v === 'company' || v === 'pending') return v;
  return 'company';
}

export function canAccessFullErp(entityKind: EntityKind, capabilityTier?: string | null): boolean {
  if (entityKind === 'company') return true;
  if (entityKind === 'sole_prop') return String(capabilityTier ?? 'lite').toLowerCase() === 'full';
  return false;
}

export function canViewModule(
  entityKind: EntityKind,
  modules: Partial<Record<ModuleWriteKey, boolean>> | null | undefined,
  module: ModuleWriteKey,
): boolean {
  if (entityKind === 'personal' || entityKind === 'pending') return false;
  return Boolean(modules?.[module]);
}

/**
 * Optional ERP modules (sales, purchase, inventory, POS, rental) are a write
 * ceiling. Authorised company/sole_prop members may still open existing
 * documents after a module is switched off. Personal/pending never receive
 * those modules. Nav continues to use canViewModule so disabled suites stay
 * off the menu (BUG-0043).
 */
export function entityCanReadModularHistory(entityKind: EntityKind): boolean {
  return entityKind !== 'personal' && entityKind !== 'pending';
}

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

export const MODULE_WRITE_KEYS: ModuleWriteKey[] = ['sales', 'purchase', 'inventory', 'pos', 'rental', 'hr'];

/** Declared sellable defaults for a billed plan. Inventory/POS stay off on Starter. */
export function modulesForPlan(plan: string | null | undefined): Record<ModuleWriteKey, boolean> {
  const p = (plan || 'starter').toLowerCase();
  if (p === 'pro') {
    return { sales: true, purchase: true, inventory: true, pos: true, rental: true, hr: false };
  }
  if (p === 'growth') {
    return { sales: true, purchase: true, inventory: true, pos: false, rental: false, hr: false };
  }
  return { sales: true, purchase: true, inventory: false, pos: false, rental: false, hr: false };
}

/**
 * Permission ceiling flags. Empty JSON follows the tenant plan (BUG-0050).
 * Explicit keys, including false, stay as stored. Missing keys stay off.
 */
export function effectiveModules(
  raw: unknown,
  plan?: string | null,
): Partial<Record<ModuleWriteKey, boolean>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return modulesForPlan(plan);
  const obj = raw as Record<string, unknown>;
  const hasAny = MODULE_WRITE_KEYS.some((key) => key in obj);
  if (!hasAny) return modulesForPlan(plan);
  const out: Partial<Record<ModuleWriteKey, boolean>> = {};
  for (const key of MODULE_WRITE_KEYS) {
    if (key in obj) out[key] = Boolean(obj[key]);
  }
  return out;
}
