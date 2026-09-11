import {
  isPrivilegedKey,
  moduleOfKey,
  type AccessLevel,
  type PermissionKey,
} from './catalog';
import {
  canViewModule,
  canWriteModule,
  parseEntityKind,
  type ModuleWriteKey,
} from './ceiling';

export type ResolveInput = {
  platformRole: 'super_admin' | 'user';
  rbacEnforced: boolean;
  primaryTemplateKey: string | null;
  extraTemplateKey: string | null;
  grants: { key: string; level: AccessLevel }[];
  overrides: { key: string; effect: 'allow' | 'deny' }[];
  entityKind: string;
  capabilityTier: string | null;
  modules: Partial<Record<ModuleWriteKey, boolean>>;
  legacyRole?: string | null;
};

function rank(level: AccessLevel): number {
  if (level === 'write') return 2;
  if (level === 'read') return 1;
  return 0;
}

function maxLevel(a: AccessLevel, b: AccessLevel): AccessLevel {
  return rank(a) >= rank(b) ? a : b;
}

function needSatisfied(have: AccessLevel, need: 'read' | 'write'): boolean {
  if (need === 'read') return have === 'read' || have === 'write';
  return have === 'write';
}

export function privilegedLevel(primaryTemplateKey: string | null, key: string): AccessLevel {
  if (!isPrivilegedKey(key)) return 'none';
  if (key === 'team.people.write' || key === 'team.jobs.write') {
    return primaryTemplateKey === 'owner' || primaryTemplateKey === 'admin' ? 'write' : 'none';
  }
  if (key === 'team.people.read' || key === 'team.jobs.read') {
    return primaryTemplateKey === 'owner' || primaryTemplateKey === 'admin' ? 'read' : 'none';
  }
  if (key === 'company.lifecycle.write' || key === 'company.reset.write') {
    return primaryTemplateKey === 'owner' ? 'write' : 'none';
  }
  return 'none';
}

export function ceilingAllows(
  tenant: Pick<ResolveInput, 'entityKind' | 'capabilityTier' | 'modules'>,
  key: string,
  need: 'read' | 'write',
): boolean {
  const mod = moduleOfKey(key);
  const kind = parseEntityKind(tenant.entityKind);
  if (mod === 'pos' || mod === 'inventory' || mod === 'sales' || mod === 'purchase' || mod === 'rental') {
    if (need === 'read') return canViewModule(kind, tenant.modules, mod);
    return canWriteModule(kind, tenant.capabilityTier, tenant.modules, mod);
  }
  if (kind === 'personal') {
    return (
      key.startsWith('accounting.cashbook') ||
      key.startsWith('accounting.simple_entry') ||
      key.startsWith('accounting.reports') ||
      key.startsWith('accounting.transactions')
    );
  }
  return true;
}

function fallbackFullAccess(input: ResolveInput): boolean {
  if (input.rbacEnforced) return false;
  const slug = (input.primaryTemplateKey || input.legacyRole || '').toLowerCase();
  return slug === 'owner' || slug === 'admin' || slug === 'member' || slug === 'super_admin' || !slug;
}

export function resolveLevel(input: ResolveInput, key: string): AccessLevel {
  if (key.startsWith('control_room')) {
    return input.platformRole === 'super_admin' ? 'write' : 'none';
  }

  const needWrite = key.endsWith('.write');
  const need: 'read' | 'write' = needWrite ? 'write' : 'read';
  if (!ceilingAllows(input, key, need)) {
    if (need === 'write' && ceilingAllows(input, key, 'read')) {
      // fall through to see if they have read via job — but this key is a write key
    } else if (need === 'write') {
      return 'none';
    } else {
      return 'none';
    }
  }
  if (need === 'write' && !ceilingAllows(input, key, 'write')) return 'none';
  if (need === 'read' && !ceilingAllows(input, key, 'read')) return 'none';

  if (fallbackFullAccess(input)) {
    if (need === 'write' && ceilingAllows(input, key, 'write')) return 'write';
    if (ceilingAllows(input, key, 'read')) return key.endsWith('.write') ? 'write' : 'read';
  }

  let have: AccessLevel = 'none';
  if (isPrivilegedKey(key)) {
    have = privilegedLevel(input.primaryTemplateKey, key);
  } else {
    for (const g of input.grants) {
      if (g.key === key) have = maxLevel(have, g.level);
      if (key.endsWith('.read') && g.key === key.replace(/\.read$/, '.write') && g.level === 'write') {
        have = maxLevel(have, 'read');
      }
    }
  }

  const deny = input.overrides.find((o) => o.key === key && o.effect === 'deny');
  if (deny) return 'none';
  const allow = input.overrides.find((o) => o.key === key && o.effect === 'allow' && !isPrivilegedKey(key));
  if (allow) have = maxLevel(have, key.endsWith('.write') ? 'write' : 'read');

  if (key.endsWith('.read') && have === 'none') {
    const writeHave = resolveWriteOnly(input, key.replace(/\.read$/, '.write'));
    if (writeHave === 'write') return 'read';
  }
  return have;
}

function resolveWriteOnly(input: ResolveInput, writeKey: string): AccessLevel {
  if (isPrivilegedKey(writeKey)) return privilegedLevel(input.primaryTemplateKey, writeKey);
  let have: AccessLevel = 'none';
  for (const g of input.grants) {
    if (g.key === writeKey) have = maxLevel(have, g.level);
  }
  return have;
}

export function allows(input: ResolveInput, key: PermissionKey | string, need: 'read' | 'write'): boolean {
  const prefix = String(key).replace(/\.(read|write)$/, '');
  if (need === 'write') {
    if (!ceilingAllows(input, `${prefix}.write`, 'write')) return false;
    return resolveLevel(input, `${prefix}.write`) === 'write';
  }
  if (!ceilingAllows(input, `${prefix}.read`, 'read')) return false;
  const writeHave = resolveLevel(input, `${prefix}.write`);
  const readHave = resolveLevel(input, `${prefix}.read`);
  return needSatisfied(maxLevel(writeHave, readHave), 'read');
}
