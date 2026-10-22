'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';
import { layoutViewportSize, placeFloatingOverlay } from '@bookone/accounting';
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
  anchorEl,
  children,
  wide = false,
  onClose,
}: {
  anchorEl: HTMLElement;
  children: ReactNode;
  wide?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => {
    const r = anchorEl.getBoundingClientRect();
    return { left: Math.max(8, r.left), top: r.bottom + 8 };
  });

  useEffect(() => {
    function place() {
      const el = ref.current;
      const rect = anchorEl.getBoundingClientRect();
      const measured = el
        ? { width: el.offsetWidth, height: el.offsetHeight }
        : { width: wide ? 340 : 260, height: 80 };
      const viewport = layoutViewportSize(
        { width: window.innerWidth, height: window.innerHeight },
        {
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
        },
      );
      setPos(
        placeFloatingOverlay({
          anchor: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          size: measured,
          viewport,
        }),
      );
    }
    place();
    const id = window.requestAnimationFrame(place);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorEl, wide, onClose]);

  return createPortal(
    <div
      ref={ref}
      className={`status-tip-bubble${wide ? ' is-wide' : ''}`}
      role="tooltip"
      style={{ left: pos.left, top: pos.top, position: 'fixed', zIndex: 90 }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function StatusBadge({ status, family }: { status: string; family?: StatusFamily }) {
  const item = statusHelp(family, status);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  function show() {
    if (!item || !wrapRef.current) return;
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
      {open && wrapRef.current && item
        ? (
            <TipBubble anchorEl={wrapRef.current} onClose={() => setOpen(false)}>
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
      {open && btnRef.current
        ? (
            <TipBubble wide anchorEl={btnRef.current} onClose={() => setOpen(false)}>
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
