import { canAccessFullErp, parseEntityKind } from '@/lib/entity-kind';

/** Human labels for admin tables and workspace switcher */
export function entityKindLabel(
  entityKind?: string | null,
  capabilityTier?: string | null,
): string {
  const k = parseEntityKind(entityKind);
  if (k === 'personal') return 'Personal';
  if (k === 'pending') return 'Pending';
  if (k === 'sole_prop') {
    return canAccessFullErp(k, capabilityTier) ? 'Sole · Full' : 'Sole · Lite';
  }
  return 'Company';
}

export function entityKindShort(entityKind?: string | null): string {
  const k = parseEntityKind(entityKind);
  if (k === 'personal') return 'Personal';
  if (k === 'pending') return 'Pending';
  if (k === 'sole_prop') return 'Sole prop';
  return 'Company';
}
