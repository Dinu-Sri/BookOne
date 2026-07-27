'use client';

/**
 * Sinhala gloss toggle — label uses Sinhala script for recognition.
 * Active = hints on; inactive = English-only labels.
 */
export function SiToggle({
  on,
  onChange,
  className = 'cashbook-si-toggle',
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${className} si-toggle ${on ? 'is-on' : ''}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
      title={on ? 'Sinhala hints on — click to turn off' : 'Show Sinhala hints on labels'}
      aria-label={on ? 'Turn off Sinhala hints' : 'Turn on Sinhala hints'}
    >
      <span className="si-toggle-label si-text" lang="si">
        සිංහල
      </span>
      {on ? <span className="si-toggle-check" aria-hidden>✓</span> : null}
    </button>
  );
}
