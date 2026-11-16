import {
  canWriteModule,
  type EntityKind,
  type ModuleWriteKey,
} from './entity-kind';
import type { NavItem, NavSuite } from './nav-suites';
import {
  isPosNavItem,
  isRentalNavItem,
  suiteModuleKey,
  type TenantModules,
} from './platform-modules';

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

export type FilterVisibleSuitesInput = {
  suites: readonly NavSuite[];
  isSuperAdmin: boolean;
  modules: TenantModules;
  entityKind: EntityKind | null;
  capabilityTier?: string | null;
  accessByLabel?: Record<string, 'none' | 'read' | 'write'>;
  soleNeedsCashbook: boolean;
  cashbookItem: NavItem;
};

/** One permission/module filter for List and Tiles. */
export function filterVisibleSuites(input: FilterVisibleSuitesInput): NavSuite[] {
  const cashbookItem = input.cashbookItem;
  return input.suites
    .filter((suite) => !suite.superAdminOnly || input.isSuperAdmin)
    .map((suite) => {
      const modKey = suiteModuleKey(suite.id) as ModuleWriteKey | null;
      if (modKey && !input.modules[modKey]) {
        return null;
      }
      let items = suite.items;
      if (suite.id === 'sales' && !input.modules.pos) {
        items = items.filter((item) => !isPosNavItem(item.label));
      }
      if ((suite.id === 'company' || suite.id === 'inventory') && !input.modules.rental) {
        items = items.filter((item) => !isRentalNavItem(item.label));
      }
      if (suite.id === 'company' && input.entityKind === 'personal') {
        items = items.filter(
          (item) => item.label !== 'Team' && item.label !== 'Jobs' && item.label !== 'Groups',
        );
      }
      if (input.accessByLabel) {
        items = items.filter((item) =>
          keepNavItem({
            label: item.label,
            href: item.href,
            accessByLabel: input.accessByLabel,
            suiteSuperAdminOnly: suite.superAdminOnly,
            isSuperAdmin: input.isSuperAdmin,
          }),
        );
      }
      if (suite.id === 'accounting' && input.soleNeedsCashbook) {
        items = [items[0]!, cashbookItem, ...items.slice(1)];
      }
      if (
        input.entityKind &&
        modKey &&
        (modKey === 'inventory' || modKey === 'pos') &&
        !canWriteModule(input.entityKind, input.capabilityTier, input.modules, modKey)
      ) {
        return { ...suite, label: `${suite.label} (view)`, items };
      }
      return { ...suite, items };
    })
    .filter((suite): suite is NavSuite => suite != null && suite.items.length > 0);
}

/** Legacy per-item height estimate that clipped View-only rows (UI-NAV-01). */
export function legacySuitePanelMaxHeightPx(
  items: Array<{ subtitle?: string; viewOnly?: boolean }>,
): number {
  return items.reduce((h, it) => h + (it.subtitle ? 52 : 40), 12);
}

export function suiteIdForActiveLabel(
  suites: readonly NavSuite[],
  active: string | undefined,
): string | undefined {
  return suites.find((suite) => suite.items.some((item) => item.label === active))?.id;
}
