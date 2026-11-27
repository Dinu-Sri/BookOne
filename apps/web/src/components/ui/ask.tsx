'use client';

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextField } from '@/components/ui/text-field';

/**
 * BookOne's own pop-ups as promises. Use these instead of window.confirm / alert / prompt,
 * which look like browser warnings and cannot be styled (UI rule book, rule 8).
 */

type ConfirmOpts = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary' | 'warning';
};

function mount<T>(render: (done: (v: T) => void) => React.ReactNode): Promise<T> {
  return new Promise<T>((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: T) => {
      root.unmount();
      host.remove();
      resolve(v);
    };
    root.render(render(done));
  });
}

/** Ask a yes/no question in a BookOne dialog. Resolves true when the person confirms. */
export function askConfirm(opts: ConfirmOpts): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return mount<boolean>((done) => (
    <ConfirmDialog
      open
      title={opts.title}
      message={opts.message}
      confirmLabel={opts.confirmLabel ?? 'Continue'}
      cancelLabel={opts.cancelLabel ?? 'Cancel'}
      tone={opts.tone ?? 'primary'}
      onConfirm={() => done(true)}
      onCancel={() => done(false)}
    />
  ));
}

function TextAsk({
  opts,
  done,
}: {
  opts: ConfirmOpts & { label: string; defaultValue?: string; placeholder?: string };
  done: (v: string | null) => void;
}) {
  const [value, setValue] = useState(opts.defaultValue ?? '');
  return (
    <ConfirmDialog
      open
      title={opts.title}
      message={opts.message}
      confirmLabel={opts.confirmLabel ?? 'OK'}
      cancelLabel={opts.cancelLabel ?? 'Cancel'}
      tone={opts.tone ?? 'primary'}
      onConfirm={() => done(value)}
      onCancel={() => done(null)}
    >
      <TextField
        id="ask-text"
        label={opts.label}
        value={value}
        placeholder={opts.placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            done(value);
          }
        }}
        autoFocus
      />
    </ConfirmDialog>
  );
}

/** Ask for one line of text in a BookOne dialog. Resolves null when cancelled. */
export function askText(opts: ConfirmOpts & { label: string; defaultValue?: string; placeholder?: string }): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return mount<string | null>((done) => <TextAsk opts={opts} done={done} />);
}
