'use client';

import type { ReactNode } from 'react';

const STEPS = [
  { id: 'upload', label: '1' },
  { id: 'account', label: '2' },
  { id: 'sheet', label: '3' },
  { id: 'table', label: '4' },
  { id: 'date', label: '5' },
  { id: 'description', label: '6' },
  { id: 'money', label: '7' },
  { id: 'review', label: '8' },
  { id: 'import', label: '9' },
] as const;

export type StudioStepId = (typeof STEPS)[number]['id'];
export type StepTone = 'neutral' | 'blue' | 'yellow' | 'green' | 'amber' | 'purple';

/**
 * Compact split: sheet left, coach panel right (top-aligned, no empty stretch).
 */
export function StudioShell({
  step,
  title,
  tone = 'neutral',
  icon,
  children,
  sheet,
  onBack,
  onContinue,
  continueLabel = 'Next',
  continueDisabled,
  continueHint,
  pending,
  stepIndex,
  stepTotal,
  compact = false,
}: {
  step: StudioStepId;
  title: string;
  tone?: StepTone;
  icon?: ReactNode;
  children: ReactNode;
  sheet?: ReactNode;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  /** Why Next/Import is disabled */
  continueHint?: string | null;
  pending?: boolean;
  stepIndex: number;
  stepTotal: number;
  compact?: boolean;
}) {
  const activeIdx = STEPS.findIndex((s) => s.id === step);
  const split = Boolean(sheet) && !compact;

  return (
    <div className={`bis-workspace tone-${tone} ${split ? 'split' : 'single'}`}>
      {split ? <aside className="bis-pane-sheet">{sheet}</aside> : null}

      <section className="bis-pane-step">
        <div className={`bis-step-top tone-${tone}`}>
          <div className="bis-dots" aria-label={`Step ${stepIndex} of ${stepTotal}`}>
            {STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`bis-dot ${i < activeIdx ? 'done' : ''} ${i === activeIdx ? 'active' : ''}`}
              />
            ))}
            <span className="bis-step-num">
              {stepIndex}/{stepTotal}
            </span>
          </div>
          <div className="bis-q-row">
            {icon ? <span className={`bis-q-icon tone-${tone}`}>{icon}</span> : null}
            <h1 className="bis-q">{title}</h1>
          </div>
        </div>

        <div className="bis-step-body">{children}</div>

        <footer className="bis-step-foot">
          {onBack ? (
            <button type="button" className="bis-btn secondary" onClick={onBack} disabled={pending}>
              Back
            </button>
          ) : (
            <span />
          )}
          <div className="bis-foot-right">
            {continueHint && continueDisabled ? (
              <p className="bis-continue-hint">{continueHint}</p>
            ) : null}
            {onContinue ? (
              <button
                type="button"
                className="bis-btn primary"
                onClick={onContinue}
                disabled={pending || continueDisabled}
              >
                {pending ? '…' : continueLabel}
              </button>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  );
}
