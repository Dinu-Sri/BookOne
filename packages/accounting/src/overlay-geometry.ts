/**
 * Viewport-aware overlay placement. Uses layout width (excludes scrollbar)
 * and measured bubble size, not a nominal CSS width.
 */

export type OverlayRect = { left: number; top: number; right: number; bottom: number };
export type OverlaySize = { width: number; height: number };
export type OverlayViewport = { width: number; height: number };

/** Prefer the layout viewport (clientWidth) so a vertical scrollbar is not treated as usable space. */
export function layoutViewportSize(inner: OverlayViewport, client?: Partial<OverlayViewport>): OverlayViewport {
  const width =
    client?.width && client.width > 0 && client.width <= inner.width ? client.width : inner.width;
  const height =
    client?.height && client.height > 0 && client.height <= inner.height ? client.height : inner.height;
  return { width, height };
}

/** Border-box cap so both `pad` gutters fit inside layout width (`100vw` includes the scrollbar). */
export function overlayMaxWidth(layoutWidth: number, pad = 8): number {
  return Math.max(0, layoutWidth - pad * 2);
}

export function placeFloatingOverlay(opts: {
  anchor: OverlayRect;
  size: OverlaySize;
  viewport: OverlayViewport;
  gap?: number;
  pad?: number;
}): { left: number; top: number } {
  const gap = opts.gap ?? 8;
  const pad = opts.pad ?? 8;
  const { width: vw, height: vh } = opts.viewport;
  const bw = Math.max(0, opts.size.width);
  const bh = Math.max(0, opts.size.height);
  const maxLeft = Math.max(pad, vw - bw - pad);
  const left = Math.min(Math.max(pad, opts.anchor.left), maxLeft);
  const below = opts.anchor.bottom + gap;
  const above = opts.anchor.top - bh - gap;
  const fitsBelow = below + bh <= vh - pad;
  let top = fitsBelow ? below : Math.max(pad, above);
  const maxTop = Math.max(pad, vh - bh - pad);
  top = Math.min(Math.max(pad, top), maxTop);
  return { left, top };
}
