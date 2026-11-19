'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/bookone-ui';

export function DashboardControls({
  compare,
  generatedAt,
}: {
  compare: boolean;
  generatedAt: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setCompare(next: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('compare', next ? '1' : '0');
    router.push(`${pathname}?${params.toString()}`);
  }

  const shown = new Date(generatedAt);
  const stamp = Number.isNaN(shown.getTime())
    ? generatedAt
    : shown.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="dash-controls">
      <label className="dash-compare">
        <input
          type="checkbox"
          checked={compare}
          onChange={(e) => setCompare(e.target.checked)}
        />
        <span>Compare previous</span>
      </label>
      <p className="dash-stamp">
        Figures as of this load · {stamp}
      </p>
      <Button type="button" variant="secondary" id="refresh" onClick={() => router.refresh()}>
        Refresh
      </Button>
    </div>
  );
}
