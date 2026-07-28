'use client';

import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDisplayDate } from '@/lib/cashbook-prefs';

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string): Date {
  if (!iso || iso.length < 10) return new Date();
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * BookOne calendar date field — same visual language as ERP header date widget.
 * Closes on outside click / Escape. Value is always YYYY-MM-DD.
 */
export function DateField({
  value,
  onChange,
  label,
  compact = false,
}: {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  compact?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  const [view, setView] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));

  useEffect(() => {
    if (!open) return;
    setView(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [open, value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startOffset = first.getDay();
    const totalDays = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    return Array.from({ length: startOffset + totalDays }, (_, index) => {
      if (index < startOffset) return null;
      return new Date(view.getFullYear(), view.getMonth(), index - startOffset + 1);
    });
  }, [view]);

  const monthLabel = view.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const triggerLabel = formatDisplayDate(value || isoFromDate(new Date()));

  function pick(d: Date) {
    onChange(isoFromDate(d));
    setOpen(false);
  }

  function goMonth(delta: number) {
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  }

  return (
    <div ref={rootRef} className={`date-field date-quick ${compact ? 'compact' : ''}`}>
      {label ? <span className="date-field-label">{label}</span> : null}
      <button
        className="date-trigger period-trigger"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarDays size={16} />
        <span>{triggerLabel}</span>
        <ChevronDown className="select-chevron" size={15} aria-hidden />
      </button>
      {open ? (
        <div className="date-menu" role="dialog" aria-label="Choose date">
          <div className="date-menu-head date-menu-nav">
            <button type="button" className="date-nav-btn" onClick={() => goMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <strong>{monthLabel}</strong>
            <button type="button" className="date-nav-btn" onClick={() => goMonth(1)} aria-label="Next month">
              <ChevronRight size={16} />
            </button>
          </div>
          <button
            type="button"
            className="date-today-link"
            onClick={() => pick(new Date())}
          >
            Today
          </button>
          <div className="date-grid date-weekdays">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="date-grid">
            {days.map((day, index) =>
              day ? (
                <button
                  type="button"
                  key={day.toISOString()}
                  className={sameDay(day, selected) ? 'today' : ''}
                  onClick={() => pick(day)}
                >
                  {day.getDate()}
                  {sameDay(day, selected) ? <Check size={11} /> : null}
                </button>
              ) : (
                <span key={`blank-${index}`} />
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
