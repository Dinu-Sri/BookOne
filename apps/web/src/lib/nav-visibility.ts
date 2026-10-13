/** Control Room labels are platform-only and are not in SCREEN_DEFS. */
export const CONTROL_ROOM_NAV_LABELS = [
  'Overview',
  'Companies',
  'Modules',
  'Access',
  'ERP Health Check',
] as const;

export function keepNavItem(args: {
  label: string;
  href?: string;
  accessByLabel?: Record<string, 'none' | 'read' | 'write'>;
  suiteSuperAdminOnly?: boolean;
  isSuperAdmin?: boolean;
}): boolean {
  if (!args.href) return true;
  if (args.label === 'Documentation') return true;
  if (args.suiteSuperAdminOnly && args.isSuperAdmin) return true;
  if (!args.accessByLabel) return true;
  const level = args.accessByLabel[args.label] ?? 'none';
  return level !== 'none';
}
