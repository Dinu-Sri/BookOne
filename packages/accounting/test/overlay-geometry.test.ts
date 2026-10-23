import { describe, expect, it } from 'vitest';
import { layoutViewportSize, overlayMaxWidth, placeFloatingOverlay } from '../src/overlay-geometry';
import { nextFocusIndex, resolveReturnFocus } from '../src/focus-trap';

describe('StatusHelp overlay placement', () => {
  it('at 320px uses measured 304 width so left is not -28', () => {
    const nominal = placeFloatingOverlay({
      anchor: { left: 8, top: 40, right: 40, bottom: 58 },
      size: { width: 340, height: 120 },
      viewport: { width: 320, height: 844 },
    });
    expect(nominal.left).toBe(8);
    const measured = placeFloatingOverlay({
      anchor: { left: 8, top: 40, right: 40, bottom: 58 },
      size: { width: 304, height: 120 },
      viewport: { width: 320, height: 844 },
    });
    expect(measured.left).toBe(8);
    expect(measured.left + 304).toBeLessThanOrEqual(320 - 8);
  });

  it('preserves 390px x42+340 geometry: no clip solely from 42+340', () => {
    const placed = placeFloatingOverlay({
      anchor: { left: 42, top: 40, right: 74, bottom: 58 },
      size: { width: 340, height: 160 },
      viewport: { width: 390, height: 844 },
    });
    expect(placed.left).toBe(42);
    expect(placed.left + 340).toBe(382);
    expect(382).toBeLessThanOrEqual(390);
  });

  it('clamps to layout width when a scrollbar makes clientWidth 375 of inner 390', () => {
    const layout = layoutViewportSize({ width: 390, height: 844 }, { width: 375, height: 844 });
    expect(layout.width).toBe(375);
    const placed = placeFloatingOverlay({
      anchor: { left: 42, top: 40, right: 74, bottom: 58 },
      size: { width: 340, height: 160 },
      viewport: layout,
    });
    expect(placed.left).toBe(27);
    expect(placed.left + 340).toBeLessThanOrEqual(375 - 8);
  });

  it('flips above the anchor when there is no room below', () => {
    const placed = placeFloatingOverlay({
      anchor: { left: 20, top: 780, right: 52, bottom: 800 },
      size: { width: 260, height: 140 },
      viewport: { width: 1280, height: 855 },
    });
    expect(placed.top + 140).toBeLessThanOrEqual(855 - 8);
    expect(placed.top).toBeLessThan(780);
  });

  it('desktop corners stay padded', () => {
    const right = placeFloatingOverlay({
      anchor: { left: 1200, top: 10, right: 1240, bottom: 28 },
      size: { width: 340, height: 80 },
      viewport: { width: 1280, height: 855 },
    });
    expect(right.left).toBe(1280 - 340 - 8);
    expect(right.top).toBe(36);
  });
});

describe('ConfirmDialog focus cycle', () => {
  it('tabs forward from last to first and backward from first to last', () => {
    expect(nextFocusIndex(2, 1, false)).toBe(0);
    expect(nextFocusIndex(2, 0, true)).toBe(1);
    expect(nextFocusIndex(2, 0, false)).toBe(1);
  });

  it('cycles nested fields plus Cancel/Confirm', () => {
    expect(nextFocusIndex(4, 3, false)).toBe(0);
    expect(nextFocusIndex(4, 0, true)).toBe(3);
    expect(nextFocusIndex(4, 2, false)).toBe(3);
  });

  it('empty set stays at 0', () => {
    expect(nextFocusIndex(0, 0, false)).toBe(0);
  });
});

describe('overlayMaxWidth layout gutters', () => {
  it('caps width to layout minus two 8px gutters (305 layout → 289)', () => {
    expect(overlayMaxWidth(305)).toBe(289);
    expect(overlayMaxWidth(320)).toBe(304);
    expect(overlayMaxWidth(390)).toBe(374);
    expect(overlayMaxWidth(7)).toBe(0);
  });

  it('at 320 inner / 305 layout a constrained 289 bubble keeps both 8px gutters', () => {
    const layout = layoutViewportSize({ width: 320, height: 844 }, { width: 305, height: 844 });
    expect(layout.width).toBe(305);
    const width = Math.min(340, overlayMaxWidth(layout.width));
    expect(width).toBe(289);
    const placed = placeFloatingOverlay({
      anchor: { left: 8, top: 40, right: 40, bottom: 58 },
      size: { width, height: 120 },
      viewport: layout,
    });
    expect(placed.left).toBe(8);
    expect(placed.left + width).toBe(297);
    expect(placed.left + width).toBeLessThanOrEqual(layout.width - 8);
  });

  it('390 layout still allows the 340 wide bubble (unclipped x42+340)', () => {
    expect(overlayMaxWidth(390)).toBeGreaterThanOrEqual(340);
    const placed = placeFloatingOverlay({
      anchor: { left: 42, top: 40, right: 74, bottom: 58 },
      size: { width: 340, height: 160 },
      viewport: { width: 390, height: 844 },
    });
    expect(placed.left).toBe(42);
    expect(placed.left + 340).toBe(382);
  });
});

describe('ConfirmDialog return focus', () => {
  it('keeps a connected captured trigger', () => {
    const captured = { isConnected: true, id: 'menu' };
    const fallback = { isConnected: true, id: 'actions' };
    expect(resolveReturnFocus(captured, fallback)).toBe(captured);
  });

  it('falls back to a connected row Actions control when the menu item is gone', () => {
    const captured = { isConnected: false, id: 'menu' };
    const fallback = { isConnected: true, id: 'actions' };
    expect(resolveReturnFocus(captured, fallback)).toBe(fallback);
  });

  it('skips restore when the row control is gone after a legitimate archive or delete', () => {
    expect(resolveReturnFocus({ isConnected: false }, { isConnected: false })).toBeNull();
    expect(resolveReturnFocus(null, null)).toBeNull();
    expect(resolveReturnFocus(undefined, undefined)).toBeNull();
  });
});
