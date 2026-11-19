'use client';

import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDisplayDate } from '@/lib/cashbook-prefs';
import { menuPosition, type MenuPosition } from '@/components/ui/menu-position';

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string): Date | null {
  if (!iso || iso.length < 10) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * BookOne calendar date field — same visual language as ERP header date widget.
 * Value is always YYYY-MM-DD. Blank stays blank unless the caller sets a value.
 */
export function DateField({
  value,
  onChange,
  label,
  compact = false,
  id,
  name,
  required,
  disabled,
  readOnly,
  min,
  max,
  error,
  help,
  allowBlank,
}: {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  compact?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  min?: string;
  max?: string;
  error?: string;
  help?: string;
  allowBlank?: boolean;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  const [view, setView] = useState(() => {
    const seed = selected ?? new Date();
    return new Date(seed.getFullYear(), seed.getMonth(), 1);
  });
  const [pos, setPos] = useState<MenuPosition | null>(null);
  const [mounted, setMounted] = useState(false);
  const portal = !compact;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const seed = selected ?? new Date();
    setView(new Date(seed.getFullYear(), seed.getMonth(), 1));
  }, [open, value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    function place() {
      if (!triggerRef.current) return;
      setPos(menuPosition(triggerRef.current.getBoundingClientRect(), { menuWidth: 280, menuHeight: 320 }));
    }
    place();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onScroll() {
      if (portal) setOpen(false);
    }
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      const menu = document.getElementById(`${fieldId}-menu`);
      if (menu?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    if (portal) window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, portal, fieldId]);

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
  const blank = allowBlank !== false && !value;
  const triggerLabel = blank || !selected ? 'Select date' : formatDisplayDate(value);
  const helpId = help ? `${fieldId}-help` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const minDate = parseIso(min ?? '');
  const maxDate = parseIso(max ?? '');

  function inRange(d: Date): boolean {
    if (minDate && d < minDate) return false;
    if (maxDate && d > maxDate) return false;
    return true;
  }

  function pick(d: Date) {
    if (!inRange(d) || readOnly || disabled) return;
    onChange(isoFromDate(d));
    setOpen(false);
    triggerRef.current?.focus();
  }

  function goMonth(delta: number) {
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  }

  function goYear(delta: number) {
    setView((v) => new Date(v.getFullYear() + delta, v.getMonth(), 1));
  }

  const calendar = open ? (
    <div
      id={`${fieldId}-menu`}
      className={`date-menu ${portal && pos?.openUp ? 'open-up' : ''}`}
      role="dialog"
      aria-label="Choose date"
      style={
        portal && pos
          ? {
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: pos.openUp ? 'translateY(-100%)' : undefined,
              zIndex: 330,
            }
          : undefined
      }
    >
      <div className="date-menu-head date-menu-nav">
        <button type="button" className="date-nav-btn" onClick={() => goYear(-1)} aria-label="Previous year">
          «
        </button>
        <button type="button" className="date-nav-btn" onClick={() => goMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={16} />
        </button>
        <strong>{monthLabel}</strong>
        <button type="button" className="date-nav-btn" onClick={() => goMonth(1)} aria-label="Next month">
          <ChevronRight size={16} />
        </button>
        <button type="button" className="date-nav-btn" onClick={() => goYear(1)} aria-label="Next year">
          »
        </button>
      </div>
      <div className="date-grid date-weekdays">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <span key={`${day}-${i}`}>{day}</span>
        ))}
      </div>
      <div className="date-grid">
        {days.map((day, index) =>
          day ? (
            <button
              type="button"
              key={isoFromDate(day)}
              className={`${selected && sameDay(day, selected) ? 'today selected' : ''}${inRange(day) ? '' : ' is-disabled'}`}
              disabled={!inRange(day)}
              onClick={() => pick(day)}
            >
              {day.getDate()}
              {selected && sameDay(day, selected) ? <Check size={11} /> : null}
            </button>
          ) : (
            <span key={`blank-${index}`} />
          ),
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={`${compact ? '' : 'field '}date-field date-quick ${compact ? 'compact' : ''}`.trim()}>
      {label ? (
        <label htmlFor={fieldId} className="date-field-label">
          {label}
          {required ? (
            <span className="field-required" aria-hidden>
              {' '}
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={triggerRef}
        id={fieldId}
        className="date-trigger period-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled || readOnly}
        onClick={() => {
          if (disabled || readOnly) return;
          setOpen((v) => !v);
        }}
      >
        <CalendarDays size={16} />
        <span className={blank ? 'select-field-placeholder' : undefined}>{triggerLabel}</span>
        <ChevronDown className="select-chevron" size={15} aria-hidden />
      </button>
      {help ? (
        <p id={helpId} className="field-help">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="form-error inline" role="alert">
          {error}
        </p>
      ) : null}
      {portal && mounted && calendar ? createPortal(calendar, document.body) : calendar}
    </div>
  );
}
