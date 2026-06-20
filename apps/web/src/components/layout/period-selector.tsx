'use client';

import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

function formatPeriod(period: string): string {
  return new Date(`${period}-01`).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

export function PeriodSelector({
  selected,
  available,
  compact = false,
}: {
  selected: string | null;
  available: string[];
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const options = useMemo(() => ['all', ...available], [available]);
  const selectedLabel = selected ? formatPeriod(selected) : 'All time';

  function updatePeriod(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.set('period', 'all');
    } else {
      params.set('period', value);
    }
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
    setOpen(false);
  }

  return (
    <div className={`period-picker ${compact ? 'compact' : ''}`}>
      <button
        className="period-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <CalendarDays size={16} />
        <span>{selectedLabel}</span>
        <ChevronDown className="select-chevron" size={15} aria-hidden />
      </button>
      {open ? (
        <div className="period-menu" role="listbox" aria-label="Accounting period">
          {options.map((period) => {
            const isAll = period === 'all';
            const active = isAll ? selected === null : selected === period;
            return (
              <button
                className={`period-option ${active ? 'active' : ''}`}
                type="button"
                role="option"
                aria-selected={active}
                key={period}
                onClick={() => updatePeriod(period)}
              >
                <span>
                  <strong>{isAll ? 'All time' : formatPeriod(period)}</strong>
                  <small>{isAll ? 'Every posted entry' : 'Monthly view'}</small>
                </span>
                {active ? <Check size={15} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
