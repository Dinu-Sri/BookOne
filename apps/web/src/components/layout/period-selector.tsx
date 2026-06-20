'use client';

import { CalendarDays, ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

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

  function updatePeriod(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.set('period', 'all');
    } else {
      params.set('period', value);
    }
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
  }

  return (
    <label className={`period-select ${compact ? 'compact' : ''}`}>
      <CalendarDays size={16} />
      <select
        aria-label="Accounting period"
        value={selected ?? 'all'}
        onChange={(event) => updatePeriod(event.target.value)}
      >
        <option value="all">All time</option>
        {available.map((period) => (
          <option key={period} value={period}>
            {formatPeriod(period)}
          </option>
        ))}
      </select>
      <ChevronDown className="select-chevron" size={15} aria-hidden />
    </label>
  );
}
