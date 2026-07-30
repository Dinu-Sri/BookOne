'use client';

import type { ReactNode } from 'react';

const STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'account', label: 'Account' },
  { id: 'sheet', label: 'Sheet' },
  { id: 'table', label: 'Rows' },
  { id: 'date', label: 'Date' },
  { id: 'description', label: 'Details' },
  { id: 'money', label: 'Money' },
  { id: 'review', label: 'Review' },
  { id: 'import', label: 'Import' },
] as const;

export type StudioStepId = (typeof STEPS)[number]['id'];

export function StudioShell({
  step,
  title,
  subtitle,
  children,
  onBack,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled,
  pending,
  onSaveExit,
  stepIndex,
  stepTotal,
}: {
  step: StudioStepId;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  pending?: boolean;
  onSaveExit?: () => void;
  stepIndex: number;
  stepTotal: number;
}) {
  const activeIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="bis-shell">
      <header className="bis-header">
        <div>
          <p className="bis-eyebrow">Import bank statement</p>
          <p className="bis-progress-label">
            Step {stepIndex} of {stepTotal}
          </p>
        </div>
        {onSaveExit ? (
          <button type="button" className="bis-link" onClick={onSaveExit} disabled={pending}>
            Save &amp; Exit
          </button>
        ) : null}
      </header>

      <nav className="bis-steps" aria-label="Progress">
        {STEPS.map((s, i) => (
          <span
            key={s.id}
            className={`bis-step-dot ${i < activeIdx ? 'done' : ''} ${i === activeIdx ? 'active' : ''}`}
          >
            {s.label}
          </span>
        ))}
      </nav>

      <main className="bis-main">
        <h1 className="bis-title">{title}</h1>
        {subtitle ? <p className="bis-subtitle">{subtitle}</p> : null}
        <div className="bis-body">{children}</div>
      </main>

      <footer className="bis-footer">
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
            {pending ? 'Please wait…' : continueLabel}
          </button>
        ) : null}
      </footer>
    </div>
  );
}
