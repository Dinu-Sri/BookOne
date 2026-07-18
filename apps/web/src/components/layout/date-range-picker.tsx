'use client';

import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatShort(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * From–to period picker using the same trigger/menu style as the header date widget.
 * Writes `from` + `to` query params (YYYY-MM-DD). Clear = all time.
 * Closes automatically when clicking outside.
 */
export function DateRangePicker({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const fromParam = searchParams.get('from') ?? '';
  const toParam = searchParams.get('to') ?? '';
  const [from, setFrom] = useState(fromParam);
  const [to, setTo] = useState(toParam);

  useEffect(() => {
    setFrom(fromParam);
    setTo(toParam);
  }, [fromParam, toParam]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const label = useMemo(() => {
    if (fromParam && toParam) return `${formatShort(fromParam)} → ${formatShort(toParam)}`;
    if (fromParam) return `From ${formatShort(fromParam)}`;
    if (toParam) return `Until ${formatShort(toParam)}`;
    return 'All time';
  }, [fromParam, toParam]);

  function applyRange(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!nextFrom && !nextTo) {
      params.delete('from');
      params.delete('to');
      params.delete('period');
    } else {
      if (nextFrom) params.set('from', nextFrom);
      else params.delete('from');
      if (nextTo) params.set('to', nextTo);
      else params.delete('to');
      params.delete('period');
    }
    params.delete('page');
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
    setOpen(false);
  }

  function applyPreset(kind: 'all' | 'month' | '30' | '7') {
    if (kind === 'all') {
      setFrom('');
      setTo('');
      applyRange('', '');
      return;
    }
    const end = todayISO();
    const start = kind === 'month' ? monthStartISO() : daysAgoISO(kind === '7' ? 7 : 30);
    setFrom(start);
    setTo(end);
    applyRange(start, end);
  }

  return (
    <div ref={rootRef} className={`date-quick period-picker ${compact ? 'compact' : ''}`}>
      <button
        className="date-trigger period-trigger"
        type="button"
        aria-expanded={open}
        onClick={() => {
          setFrom(fromParam);
          setTo(toParam);
          setOpen((v) => !v);
        }}
      >
        <CalendarDays size={16} />
        <span>{label}</span>
        <ChevronDown className="select-chevron" size={15} aria-hidden />
      </button>
      {open ? (
        <div className="date-menu date-range-menu" role="dialog" aria-label="Select period">
          <div className="date-menu-head">
            <strong>Period</strong>
            <span>From → To</span>
          </div>
          <div className="date-range-fields">
            <label className="date-range-field">
              <span>From</span>
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="date-range-field">
              <span>To</span>
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <div className="date-range-presets">
            <button type="button" className="period-option" onClick={() => applyPreset('all')}>
              <span>
                <strong>All time</strong>
                <small>No date filter</small>
              </span>
              {!fromParam && !toParam ? <Check size={15} /> : null}
            </button>
            <button type="button" className="period-option" onClick={() => applyPreset('7')}>
              <span>
                <strong>Last 7 days</strong>
                <small>Rolling week</small>
              </span>
            </button>
            <button type="button" className="period-option" onClick={() => applyPreset('30')}>
              <span>
                <strong>Last 30 days</strong>
                <small>Rolling month</small>
              </span>
            </button>
            <button type="button" className="period-option" onClick={() => applyPreset('month')}>
              <span>
                <strong>This month</strong>
                <small>Calendar month</small>
              </span>
            </button>
          </div>
          <div className="date-range-actions">
            <button type="button" className="button secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                if (from && to && from > to) {
                  applyRange(to, from);
                } else {
                  applyRange(from, to);
                }
              }}
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
