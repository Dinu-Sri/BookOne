'use client';

import { useEffect, useState } from 'react';

const EVENT = 'bookone:form-pending';

export function emitFormPending(pending: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: pending }));
}

export function FormBusyGuard() {
  const [pending, setPending] = useState(false);
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    let slow: number | null = null;
    let started = 0;

    function onPending(e: Event) {
      const on = Boolean((e as CustomEvent).detail);
      setPending(on);
      if (on) {
        started = Date.now();
        if (slow) window.clearTimeout(slow);
        slow = window.setTimeout(() => setOverlay(true), 1500);
      } else {
        if (slow) window.clearTimeout(slow);
        slow = null;
        setOverlay(false);
        const ms = started ? Date.now() - started : 0;
        started = 0;
        if (ms >= 2000) {
          const path = window.location.pathname.slice(0, 400);
          void fetch('/api/ops/client-timing', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path, durationMs: ms }),
            keepalive: true,
          }).catch(() => undefined);
        }
      }
    }

    function onSubmit() {
      onPending(new CustomEvent(EVENT, { detail: true }));
    }

    window.addEventListener(EVENT, onPending);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      window.removeEventListener(EVENT, onPending);
      document.removeEventListener('submit', onSubmit, true);
      if (slow) window.clearTimeout(slow);
    };
  }, []);

  if (!pending && !overlay) return null;

  return (
    <div className={`form-busy-root${overlay ? ' is-overlay' : ''}`} aria-live="polite" aria-busy="true">
      {overlay ? (
        <div className="form-busy-card">
          <span className="btn-spinner" />
          Working… please wait
        </div>
      ) : null}
    </div>
  );
}

export function IdempotencyField() {
  const [key] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}`,
  );
  return <input type="hidden" name="idempotencyKey" value={key} />;
}
