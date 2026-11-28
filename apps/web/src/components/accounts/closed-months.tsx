'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { closeMonth, reopenMonth, type MonthLockRow } from '@/app/actions/period-close';
import { askConfirm, askText } from '@/components/ui/ask';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { withFormPending } from '@/components/ui/form-busy';
import { SelectField } from '@/components/ui/select-field';

function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The current month and the 23 before it, newest first. */
function recentMonths(today = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < 24; i += 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function dateLabel(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ClosedMonths({ rows, canWrite }: { rows: MonthLockRow[]; canWrite: boolean }) {
  const router = useRouter();
  const closed = useMemo(() => new Set(rows.filter((r) => r.status === 'locked').map((r) => r.period)), [rows]);
  const openMonths = useMemo(() => recentMonths().filter((p) => !closed.has(p)), [closed]);
  const [month, setMonth] = useState(openMonths[1] ?? openMonths[0] ?? '');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function handleClose() {
    if (!month) return;
    const ok = await askConfirm({
      title: `Close ${monthLabel(month)}?`,
      message: `Nothing dated in ${monthLabel(month)} can be posted after this. Corrections go in an open month as a reversal.`,
      confirmLabel: 'Close month',
      tone: 'warning',
    });
    if (!ok) return;
    setMessage(null);
    await withFormPending(async () => {
      const result = await closeMonth(month);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? 'Could not close this month.' });
        return;
      }
      setMessage({ tone: 'ok', text: `${monthLabel(month)} is closed.` });
      router.refresh();
    });
  }

  async function handleReopen(period: string) {
    const reason = await askText({
      title: `Reopen ${monthLabel(period)}?`,
      message: 'Postings dated in this month will be allowed again until you close it again. The reason is kept in the history.',
      label: 'Why are you reopening it?',
      placeholder: 'For example: correct a supplier bill entered in the wrong month',
      confirmLabel: 'Reopen month',
      tone: 'warning',
    });
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setMessage({ tone: 'error', text: 'Say why you are reopening this month.' });
      return;
    }
    setMessage(null);
    await withFormPending(async () => {
      const result = await reopenMonth(period, reason);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? 'Could not reopen this month.' });
        return;
      }
      setMessage({ tone: 'ok', text: `${monthLabel(period)} is open again.` });
      router.refresh();
    });
  }

  return (
    <div className="ux-main">
      {canWrite ? (
        <section className="ux-card" aria-labelledby="close-month-title">
          <header className="ux-card-head">
            <h2 id="close-month-title">Close a month</h2>
            <span>After this, nothing dated in that month can be posted.</span>
          </header>
          <div className="ux-rows">
            <div className="ux-row">
              <div className="ux-row-text">
                <strong>Month</strong>
                <span>Close a month once its entries are complete and checked.</span>
              </div>
              <div className="ux-row-side">
                <SelectField
                  id="close-month"
                  label="Month to close"
                  value={month}
                  onChange={setMonth}
                  options={openMonths.map((p) => ({ value: p, label: monthLabel(p) }))}
                />
                <Button variant="primary" onClick={() => void handleClose()} disabled={!month}>
                  Close month
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {message ? (
        <p className={message.tone === 'error' ? 'form-error' : 'form-success'} role={message.tone === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}

      <section className="ux-card" aria-labelledby="closed-months-title">
        <header className="ux-card-head">
          <h2 id="closed-months-title">Closed and reopened months</h2>
          <span>{closed.size === 1 ? '1 month closed' : `${closed.size} months closed`}</span>
        </header>
        {rows.length === 0 ? (
          <div className="ux-empty">
            <p>No month has been closed yet. Close a month when its entries are complete.</p>
          </div>
        ) : (
          <div className="ux-rows">
            {rows.map((row) => (
              <div className="ux-row" key={row.id}>
                <div className="ux-row-text">
                  <strong>{monthLabel(row.period)}</strong>
                  <span>
                    {row.status === 'locked'
                      ? `Closed ${dateLabel(row.lockedAt)}.`
                      : `Closed ${dateLabel(row.lockedAt)}, reopened ${dateLabel(row.unlockedAt)}.`}
                  </span>
                </div>
                <div className="ux-row-side">
                  <Badge tone={row.status === 'locked' ? 'success' : 'neutral'}>
                    {row.status === 'locked' ? 'Closed' : 'Reopened'}
                  </Badge>
                  {canWrite && row.status === 'locked' ? (
                    <Button onClick={() => void handleReopen(row.period)}>Reopen</Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
