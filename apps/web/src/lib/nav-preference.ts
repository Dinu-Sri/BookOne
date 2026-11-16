/** Browser-only sidebar layout preference. Not a company/accounting setting. */
export const NAV_MODE_STORAGE_KEY = 'bookone.nav.mode';

export type NavMode = 'list' | 'tiles';

export function parseNavMode(raw: unknown): NavMode {
  return raw === 'tiles' ? 'tiles' : 'list';
}

export function readNavMode(storage?: Pick<Storage, 'getItem'> | null): NavMode {
  try {
    return parseNavMode(storage?.getItem(NAV_MODE_STORAGE_KEY));
  } catch {
    return 'list';
  }
}

export function writeNavMode(
  mode: NavMode,
  storage?: Pick<Storage, 'setItem'> | null,
): void {
  try {
    storage?.setItem(NAV_MODE_STORAGE_KEY, mode);
  } catch {
    /* quota / private mode / missing storage */
  }
}

export function resolveTileSuite(
  requested: string | null | undefined,
  visibleSuiteIds: readonly string[],
  activeSuiteId: string | null | undefined,
): string | null {
  if (requested && visibleSuiteIds.includes(requested)) return requested;
  if (activeSuiteId && visibleSuiteIds.includes(activeSuiteId)) return activeSuiteId;
  return null;
}
