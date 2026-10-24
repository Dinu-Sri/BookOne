/** Pure focus-cycle helper for ConfirmDialog. DOM wiring lives in the shared primitive. */
export function nextFocusIndex(count: number, current: number, shift: boolean): number {
  if (count <= 0) return 0;
  if (shift) return current <= 0 ? count - 1 : current - 1;
  return current >= count - 1 ? 0 : current + 1;
}

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** BODY/HTML are connected after a portal menu unmounts; they are not a surviving control. */
export function isReturnableFocusTarget<T extends { isConnected: boolean; tagName?: string }>(
  el: T | null | undefined,
): el is T {
  if (!el?.isConnected) return false;
  const tag = String(el.tagName ?? '').toUpperCase();
  if (tag === 'BODY' || tag === 'HTML') return false;
  return true;
}

/** Prefer a still-connected captured trigger; otherwise a surviving fallback (row Actions). */
export function resolveReturnFocus<T extends { isConnected: boolean; tagName?: string }>(
  captured: T | null | undefined,
  fallback?: T | null,
): T | null {
  if (isReturnableFocusTarget(captured)) return captured;
  if (isReturnableFocusTarget(fallback)) return fallback;
  return null;
}
