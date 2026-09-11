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
