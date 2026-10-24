'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import {
  FOCUSABLE_SELECTOR,
  isReturnableFocusTarget,
  nextFocusIndex,
  resolveReturnFocus,
} from '@bookone/accounting';
import { Button } from '@/components/ui/bookone-ui';

export function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
  busy,
  returnFocus,
}: {
  open: boolean;
  title: string;
  message?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** Surviving control when the captured opener unmounts (list Actions). */
  returnFocus?: HTMLElement | null;
}) {
  const titleId = useId();
  const messageId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const fallbackRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  if (returnFocus) fallbackRef.current = returnFocus;

  useEffect(() => {
    if (open && !wasOpen.current) {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      triggerRef.current = isReturnableFocusTarget(active) ? active : null;
      wasOpen.current = true;
      const id = window.requestAnimationFrame(() => cancelRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    if (!open && wasOpen.current) {
      const trigger = triggerRef.current;
      const fallback = fallbackRef.current;
      wasOpen.current = false;
      triggerRef.current = null;
      fallbackRef.current = null;
      queueMicrotask(() => {
        resolveReturnFocus(trigger, fallback)?.focus();
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (busy) return;
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const nodes = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const current = active ? nodes.indexOf(active) : -1;
      const next = nextFocusIndex(nodes.length, current < 0 ? 0 : current, e.shiftKey);
      e.preventDefault();
      nodes[next]?.focus();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        {message ? (
          <p id={messageId} className="modal-message">
            {message}
          </p>
        ) : null}
        {children}
        <div className="modal-actions">
          <Button
            ref={cancelRef}
            variant="secondary"
            type="button"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'primary' ? 'primary' : 'secondary'}
            type="button"
            className={tone === 'danger' ? 'modal-confirm-danger' : ''}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
