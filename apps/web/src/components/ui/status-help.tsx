'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';
import { Badge, type Tone } from '@/components/ui/bookone-ui';
import {
  getStatusGuide,
  statusHelp,
  type StatusFamily,
} from '@/lib/status-guide';

function toneFor(status: string): Tone {
  if (
    status === 'paid' ||
    status === 'posted' ||
    status === 'accepted' ||
    status === 'confirmed' ||
    status === 'active' ||
    status === 'returned' ||
    status === 'refunded' ||
    status === 'received'
  ) {
    return 'success';
  }
  if (status === 'void' || status === 'cancelled' || status === 'inactive' || status === 'overdue' || status === 'rejected') {
    return 'danger';
  }
  if (status === 'draft' || status === 'open' || status === 'sent' || status === 'reserved' || status === 'dispatched') {
    return 'info';
  }
  if (status === 'converted' || status === 'partial' || status === 'closed' || status === 'archived' || status === 'pending_approval' || status === 'fully_invoiced') {
    return 'warning';
  }
  return 'neutral';
}

function TipBubble({
  anchor,
  children,
  wide = false,
  onClose,
}: {
  anchor: DOMRect;
  children: ReactNode;
  wide?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = wide ? 340 : 260;
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8);
  const top = Math.min(anchor.bottom + 8, window.innerHeight - 16);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className={`status-tip-bubble${wide ? ' is-wide' : ''}`}
      role="tooltip"
      style={{ left, top, position: 'fixed', zIndex: 90 }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function StatusBadge({ status, family }: { status: string; family?: StatusFamily }) {
  const item = statusHelp(family, status);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  function show() {
    if (!item || !wrapRef.current) return;
    setRect(wrapRef.current.getBoundingClientRect());
    setOpen(true);
  }

  return (
    <span
      ref={wrapRef}
      className="status-tip-anchor"
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
      tabIndex={item ? 0 : undefined}
    >
      <Badge tone={toneFor(status)}>{status.replace(/_/g, ' ')}</Badge>
      {open && rect && item
        ? (
            <TipBubble anchor={rect} onClose={() => setOpen(false)}>
              <strong>{item.label}</strong>
              <p>{item.meaning}</p>
              <p className="status-tip-next">{item.next}</p>
            </TipBubble>
          )
        : null}
    </span>
  );
}

export function StatusColumnHelp({ family }: { family: StatusFamily }) {
  const guide = getStatusGuide(family);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<number | null>(null);
  const id = useId();

  function cancelHide() {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }

  function show() {
    cancelHide();
    if (!btnRef.current) return;
    setRect(btnRef.current.getBoundingClientRect());
    setOpen(true);
  }

  function hideSoon() {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setOpen(false), 220);
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      const bubble = document.querySelector(`[data-status-help="${id}"]`);
      if (bubble?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, id]);

  return (
    <span className="status-col-help">
      <button
        ref={btnRef}
        type="button"
        className="status-col-help-btn"
        aria-label={`${guide.title} — what each status means`}
        aria-expanded={open}
        onClick={show}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hideSoon}
      >
        <CircleHelp size={14} strokeWidth={2.2} />
      </button>
      {open && rect
        ? (
            <TipBubble wide anchor={rect} onClose={() => setOpen(false)}>
              <div data-status-help={id} onMouseEnter={show} onMouseLeave={hideSoon}>
                <strong>{guide.title}</strong>
                <p>{guide.intro}</p>
                <ul className="status-tip-list">
                  {guide.items.map((it) => (
                    <li key={it.key}>
                      <Badge tone={toneFor(it.key)}>{it.label}</Badge>
                      <span>
                        {it.meaning} {it.next}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </TipBubble>
          )
        : null}
    </span>
  );
}
