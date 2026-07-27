'use client';

/**
 * Language toggle for cashbook / onboarding.
 * Off → English UI; button invites Sinhala.
 * On  → Sinhala UI; button offers English switch-back.
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
      title={on ? 'Switch to English' : 'සිංහලට මාරු වන්න / Switch to Sinhala'}
      aria-label={on ? 'Switch to English' : 'Switch to Sinhala'}
    >
      {on ? (
        <span className="si-toggle-label">English</span>
      ) : (
        <span className="si-toggle-label si-text" lang="si">
          සිංහල
        </span>
      )}
    </button>
  );
}
