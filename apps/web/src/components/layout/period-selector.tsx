'use client';

import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DateField } from '@/components/ui/date-field';
import {
  PERIOD_PRESETS,
  encodeCustomRange,
  isoDate,
  isCustomToken,
  isValidMonth,
  normalizePeriodToken,
  parseCustomToken,
  resolvePeriodBounds,
  writePeriodCookie,
} from '@/lib/period-range';

/**
 * Universal period picker — design: From/To + presets + Apply.
 * Writes ?period= token and bookone_period cookie so all modules share the range.
 */
export function PeriodSelector({
  selected,
  available,
  compact = false,
  /** If set, call instead of router navigation (cashbook local state). */
  onApply,
}: {
  selected: string | null;
  available?: string[];
  compact?: boolean;
  onApply?: (token: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const token = normalizePeriodToken(selected ?? 'all');
  const bounds = useMemo(() => resolvePeriodBounds(token), [token]);

  const [draftFrom, setDraftFrom] = useState(bounds.from ?? isoDate(new Date()));
  const [draftTo, setDraftTo] = useState(bounds.to ?? isoDate(new Date()));
  const [draftPreset, setDraftPreset] = useState(token);

  useEffect(() => {
    if (!open) return;
    const b = resolvePeriodBounds(token);
    setDraftFrom(b.from ?? isoDate(new Date()));
    setDraftTo(b.to ?? isoDate(new Date()));
    setDraftPreset(token);
  }, [open, token]);

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

  function applyToken(next: string) {
    const normalized = normalizePeriodToken(next);
    writePeriodCookie(normalized);
    if (onApply) {
      onApply(normalized);
      setOpen(false);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (normalized === 'all') {
      params.set('period', 'all');
    } else {
      params.set('period', normalized);
    }
    // Drop legacy from/to if any
    params.delete('from');
    params.delete('to');
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
    setOpen(false);
  }

  function applyDraft() {
    // If preset is a named mode, use it; if custom dates differ from preset bounds → custom
    const presetBounds = resolvePeriodBounds(draftPreset);
    const isNamed =
      draftPreset === 'all' ||
      draftPreset === 'last_7d' ||
      draftPreset === 'last_30d' ||
      draftPreset === 'this_month' ||
      draftPreset === 'last_month' ||
      draftPreset === 'this_fy' ||
      draftPreset === 'last_fy' ||
      isValidMonth(draftPreset);

    if (draftPreset === 'all') {
      applyToken('all');
      return;
    }

    if (
      isNamed &&
      !isCustomToken(draftPreset) &&
      presetBounds.from === draftFrom &&
      presetBounds.to === draftTo
    ) {
      applyToken(draftPreset);
      return;
    }

    // Custom range from From/To fields
    let from = draftFrom;
    let to = draftTo;
    if (from > to) {
      const t = from;
      from = to;
      to = t;
    }
    applyToken(encodeCustomRange(from, to));
  }

  function selectPreset(p: string) {
    setDraftPreset(p);
    const b = resolvePeriodBounds(p);
    if (b.from && b.to) {
      setDraftFrom(b.from);
      setDraftTo(b.to);
    }
  }

  const monthExtras = (available ?? [])
    .filter((m) => isValidMonth(m))
    .filter((m) => !PERIOD_PRESETS.some((p) => p.token === m))
    .slice(0, 8);

  return (
    <div ref={rootRef} className={`period-picker ${compact ? 'compact' : ''}`}>
      <button
        className="period-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarDays size={16} />
        <span>{bounds.label}</span>
        <ChevronDown className="select-chevron" size={15} aria-hidden />
      </button>
      {open ? (
        <div className="period-menu period-menu-rich" role="dialog" aria-label="Period">
          <div className="period-menu-head">
            <strong>Period</strong>
            <span className="period-menu-badge">From → To</span>
          </div>

          <div className="period-range-fields">
            <label className="period-range-field">
              <span>From</span>
              <DateField value={draftFrom} onChange={setDraftFrom} compact />
            </label>
            <label className="period-range-field">
              <span>To</span>
              <DateField value={draftTo} onChange={setDraftTo} compact />
            </label>
          </div>

          <div className="period-preset-list">
            {PERIOD_PRESETS.map((p) => {
              const active = draftPreset === p.token;
              return (
                <button
                  key={p.token}
                  type="button"
                  className={`period-option ${active ? 'active' : ''}`}
                  onClick={() => selectPreset(p.token)}
                >
                  <span>
                    <strong>{p.title}</strong>
                    <small>{p.hint}</small>
                  </span>
                  {active ? <Check size={15} /> : null}
                </button>
              );
            })}
            {monthExtras.map((m) => {
              const b = resolvePeriodBounds(m);
              const active = draftPreset === m;
              return (
                <button
                  key={m}
                  type="button"
                  className={`period-option ${active ? 'active' : ''}`}
                  onClick={() => selectPreset(m)}
                >
                  <span>
                    <strong>{b.label}</strong>
                    <small>Month with activity</small>
                  </span>
                  {active ? <Check size={15} /> : null}
                </button>
              );
            })}
          </div>

          <div className="period-menu-foot">
            <button type="button" className="period-btn ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="period-btn primary" onClick={applyDraft}>
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
