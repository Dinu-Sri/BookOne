'use client';

import { useId, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Square product image with hover zoom (tooltip-style larger preview).
 * Always 1:1 via aspect-ratio + object-fit: cover.
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
  const tipId = useId();
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
    <img
      className="product-img-square"
      src={src}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
    />
  ) : (
    <span className="product-img-square product-img-fallback">{fallback ?? '?'}</span>
  );

  return (
    <span
      className={`product-img-hover ${className}`.trim()}
      style={boxStyle}
      onMouseEnter={() => src && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => src && setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {onClick ? (
        <button type="button" className="product-img-trigger" style={boxStyle} onClick={onClick} aria-describedby={open ? tipId : undefined}>
          {content}
        </button>
      ) : (
        <span className="product-img-trigger" style={boxStyle}>
          {content}
        </span>
      )}
      {open && src ? (
        <span id={tipId} className="product-img-zoom" role="tooltip">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} width={zoomSize} height={zoomSize} />
        </span>
      ) : null}
    </span>
  );
}
