'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Square product image with hover zoom.
 * Preview uses a fixed-position portal so table/card overflow cannot crop it.
 */
export function ProductImageHover({
  src,
  alt = '',
  size = 40,
  zoomSize = 220,
  className = '',
  fallback,
  onClick,
}: {
  src: string | null | undefined;
  alt?: string;
  size?: number;
  zoomSize?: number;
  className?: string;
  fallback?: ReactNode;
  onClick?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const el = rootRef.current;
    if (!el || !src) return;
    const rect = el.getBoundingClientRect();
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer to the right of the thumb; flip left if not enough room
    let left = rect.right + pad;
    if (left + zoomSize > vw - pad) {
      left = rect.left - zoomSize - pad;
    }
    if (left < pad) left = pad;

    // Vertically center on thumb; clamp so full preview stays in viewport
    let top = rect.top + rect.height / 2 - zoomSize / 2;
    if (top < pad) top = pad;
    if (top + zoomSize > vh - pad) top = Math.max(pad, vh - zoomSize - pad);

    setCoords({ top, left });
  }, [src, zoomSize]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updatePosition]);

  const boxStyle = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    maxWidth: size,
    maxHeight: size,
  } as CSSProperties;

  const content = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="product-img-square" src={src} alt={alt} width={size} height={size} draggable={false} />
  ) : (
    <span className="product-img-square product-img-fallback">{fallback ?? '?'}</span>
  );

  const zoom =
    open && src && mounted && coords
      ? createPortal(
          <div
            id={tipId}
            className="product-img-zoom-portal"
            role="tooltip"
            style={{
              top: coords.top,
              left: coords.left,
              width: zoomSize,
              height: zoomSize,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} width={zoomSize} height={zoomSize} />
          </div>,
          document.body,
        )
      : null;

  return (
    <span
      ref={rootRef}
      className={`product-img-hover ${className}`.trim()}
      style={boxStyle}
      onMouseEnter={() => {
        if (src) {
          setOpen(true);
        }
      }}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => {
        if (src) setOpen(true);
      }}
      onBlur={() => setOpen(false)}
    >
      {onClick ? (
        <button
          type="button"
          className="product-img-trigger"
          style={boxStyle}
          onClick={onClick}
          aria-describedby={open ? tipId : undefined}
        >
          {content}
        </button>
      ) : (
        <span className="product-img-trigger" style={boxStyle}>
          {content}
        </span>
      )}
      {zoom}
    </span>
  );
}
