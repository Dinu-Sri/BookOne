/** Viewport-safe fixed position for portaled menus. */

export type MenuPosition = { top: number; left: number; openUp: boolean; maxHeight: number };

export function menuPosition(
  trigger: DOMRect,
  opts?: { menuWidth?: number; menuHeight?: number; gap?: number },
): MenuPosition {
  const gap = opts?.gap ?? 8;
  const menuWidth = opts?.menuWidth ?? Math.max(trigger.width, 220);
  const estimatedHeight = opts?.menuHeight ?? 280;
  const spaceBelow = window.innerHeight - trigger.bottom - gap;
  const spaceAbove = trigger.top - gap;
  const openUp = spaceBelow < Math.min(estimatedHeight, 160) && spaceAbove > spaceBelow;
  const maxHeight = Math.max(160, Math.min(320, openUp ? spaceAbove : spaceBelow));
  let left = trigger.left;
  if (left + menuWidth > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - menuWidth - 8);
  }
  if (left < 8) left = 8;
  const top = openUp ? trigger.top - gap : trigger.bottom + gap;
  return { top, left, openUp, maxHeight };
}
