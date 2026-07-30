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

/**
 * Split layout: Excel sheet (left) + short step panel (right).
 * Upload/account can omit the sheet pane.
 */
export function StudioShell({
  step,
  title,
  children,
  sheet,
  onBack,
  onContinue,
  continueLabel = 'Next',
  continueDisabled,
  pending,
  stepIndex,
  stepTotal,
  compact = false,
}: {
  step: StudioStepId;
  title: string;
  children: ReactNode;
  /** Excel-like pane; when set, uses two-column workspace */
  sheet?: ReactNode;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  pending?: boolean;
  stepIndex: number;
  stepTotal: number;
  /** Tighter single-column for upload */
  compact?: boolean;
}) {
  const activeIdx = STEPS.findIndex((s) => s.id === step);
  const split = Boolean(sheet) && !compact;

  return (
    <div className={`bis-workspace ${split ? 'split' : 'single'}`}>
      {split ? <aside className="bis-pane-sheet">{sheet}</aside> : null}

      <section className="bis-pane-step">
        <div className="bis-step-top">
          <div className="bis-dots" aria-label={`Step ${stepIndex} of ${stepTotal}`}>
            {STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`bis-dot ${i < activeIdx ? 'done' : ''} ${i === activeIdx ? 'active' : ''}`}
                title={s.id}
              />
            ))}
          </div>
          <h1 className="bis-q">{title}</h1>
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
        </footer>
      </section>
    </div>
  );
}
