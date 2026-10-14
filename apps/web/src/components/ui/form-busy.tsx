'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const EVENT = 'bookone:form-pending';
const OVERLAY_AFTER_MS = 1500;
const STUCK_MS = 45000;

export function emitFormPending(pending: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: pending }));
}

export function FormBusyGuard() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    emitFormPending(false);
  }, [pathname]);

  useEffect(() => {
    let slow: number | null = null;
    let stuck: number | null = null;
    let started = 0;

    function clearTimers() {
      if (slow) window.clearTimeout(slow);
      if (stuck) window.clearTimeout(stuck);
      slow = null;
      stuck = null;
    }

    function reportTiming(ms: number) {
      if (ms < 2000) return;
      const path = window.location.pathname.slice(0, 400);
      void fetch('/api/ops/client-timing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, durationMs: ms }),
        keepalive: true,
      }).catch(() => undefined);
    }

    function finishPending() {
      clearTimers();
      setPending(false);
      setOverlay(false);
      const ms = started ? Date.now() - started : 0;
      started = 0;
      reportTiming(ms);
    }

    function onPending(e: Event) {
      const on = Boolean((e as CustomEvent).detail);
      setPending(on);
      if (on) {
        started = Date.now();
        clearTimers();
        slow = window.setTimeout(() => setOverlay(true), OVERLAY_AFTER_MS);
        stuck = window.setTimeout(finishPending, STUCK_MS);
      } else {
        finishPending();
      }
    }

    function onSubmit(e: Event) {
      queueMicrotask(() => {
        if (e.defaultPrevented) return;
        onPending(new CustomEvent(EVENT, { detail: true }));
      });
    }

    window.addEventListener(EVENT, onPending);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      window.removeEventListener(EVENT, onPending);
      document.removeEventListener('submit', onSubmit, true);
      clearTimers();
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
