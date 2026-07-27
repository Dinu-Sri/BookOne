'use client';

import { glossEn, glossSi } from '@/lib/si-gloss';

/**
 * Label with optional Sinhala gloss in Noto Serif Sinhala.
 * Prefer this over plain gloss() when rendering in JSX for correct font.
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
  const en = glossEn(k);
  const siWord = glossSi(k);
  if (!si || !siWord) {
    return <span className={className}>{en}</span>;
  }
  return (
    <span className={className}>
      {en}{' '}
      <span className="si-text" lang="si">
        ({siWord})
      </span>
    </span>
  );
}
