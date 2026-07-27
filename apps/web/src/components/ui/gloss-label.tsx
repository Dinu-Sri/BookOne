'use client';

import { gloss } from '@/lib/si-gloss';

/**
 * Label in English or Sinhala (full replace — not English + brackets).
 * Sinhala uses Noto Serif via .si-text.
 */
export function GlossLabel({
  k,
  si,
  className,
}: {
  k: string;
  si: boolean;
  className?: string;
}) {
  const text = gloss(k, si);
  if (si) {
    return (
      <span className={`si-text ${className ?? ''}`.trim()} lang="si">
        {text}
      </span>
    );
  }
  return <span className={className}>{text}</span>;
}
