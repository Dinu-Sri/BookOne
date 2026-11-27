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

/** What the user sees: four plain stages over the nine internal steps. */
const STAGES = ['Upload', 'Account', 'Columns', 'Check & save'] as const;

function stageOf(step: StudioStepId): number {
  if (step === 'upload') return 0;
  if (step === 'account' || step === 'sheet') return 1;
  if (step === 'review' || step === 'import') return step === 'import' ? 4 : 3;
  return 2;
}
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
  const split = Boolean(sheet) && !compact;
  const stage = stageOf(step);

  return (
    <div className={`bis-workspace tone-${tone} ${split ? 'split' : 'single'}`}>
      {split ? <aside className="bis-pane-sheet">{sheet}</aside> : null}

      <section className="bis-pane-step">
        <div className={`bis-step-top tone-${tone}`}>
          <ol className="bis-stages" aria-label={`Step ${stepIndex} of ${stepTotal}`}>
            {STAGES.map((label, i) => (
              <li
                key={label}
                className={`${i < stage ? 'done' : ''} ${i === stage ? 'active' : ''}`.trim() || undefined}
                aria-current={i === stage ? 'step' : undefined}
              >
                <span aria-hidden>{i < stage ? '✓' : i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
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
