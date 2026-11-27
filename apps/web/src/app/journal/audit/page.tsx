import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantInfo } from '@/app/actions/workspace';
import { listFinancialAuditEvents } from '@/app/actions/financial-audit';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button } from '@/components/ui/bookone-ui';

const ACTION_WORDS: Record<string, { label: string; tone: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }> = {
  CREATE: { label: 'Added', tone: 'success' },
  INSERT: { label: 'Added', tone: 'success' },
  UPDATE: { label: 'Changed', tone: 'info' },
  DELETE: { label: 'Removed', tone: 'danger' },
  VOID: { label: 'Voided', tone: 'warning' },
  REVERSE: { label: 'Reversed', tone: 'warning' },
  POST: { label: 'Posted', tone: 'success' },
};

function money(raw: string) {
  const n = Number(raw);
  return Number.isFinite(n) ? n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : raw;
}

/** Turn system event text into a short plain sentence. Unknown text is only de-jargoned. */
function plainEvent(event: string): string {
  const e = String(event ?? '').trim();
  const inf = /^Engine inference:\s*confidence=([\d.]+),\s*source=(\w+)\s*-\s*([\d.]+)/i.exec(e);
  if (inf) {
    const pct = Math.round(Number(inf[1]) * 100);
    const src = inf[2]!.toLowerCase();
    const amt = money(inf[3]!);
    if (src === 'override') return `Category chosen by a person · ${amt}`;
    if (src === 'rule') return `Category picked by a rule (${pct}% sure) · ${amt}`;
    return `Category suggested by BookOne (${pct}% sure) · ${amt}`;
  }
  if (/^Created party via ensureParty/i.test(e)) return 'Added a customer or supplier';
  return e
    .replace(/\(no journal\)/gi, '(no accounting entry yet)')
    .replace(/\b([a-z]+(?:_[a-z]+)+)\b/g, (m) => m.replace(/_/g, ' '))
    .replace(/\s·\s0\.00$/, '');
}

function when(iso: string | Date | null | undefined) {
  if (!iso) return { day: '—', time: '' };
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
}

export default async function FinancialAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ record?: string; table?: string }>;
}) {
  const params = await searchParams;
  let tenant;
  let events;
  try {
    [tenant, events] = await Promise.all([
      getTenantInfo(),
      listFinancialAuditEvents({
        recordId: params.record,
        tableName: params.table,
      }),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Activity" tenant={tenant}>
      <div className="workspace ux-page act-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Activity</h1>
              <p>Who did what in this company, newest first. The accounting lines are on the Journal page.</p>
            </div>
          </div>
          <div className="ux-head-actions">
            <span className="ux-muted">{events.length} recent</span>
            <Link href="/journal" className="button secondary">
              Open journal
            </Link>
          </div>
        </header>

        {events.length === 0 ? (
          <div className="ux-empty">
            <h2>Nothing recorded yet</h2>
            <p>Invoices, payments, stock and other saved work appear here as soon as they are saved.</p>
            <Link href="/journal">
              <Button variant="secondary">Open journal</Button>
            </Link>
          </div>
        ) : (
          <section className="ux-card">
            <div className="table-wrap">
              <table className="table act-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>What happened</th>
                    <th>Record</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((row) => {
                    const w = when(row.createdAt);
                    const a = ACTION_WORDS[String(row.action).toUpperCase()] ?? { label: String(row.action).toLowerCase(), tone: 'neutral' as const };
                    return (
                      <tr key={row.id}>
                        <td className="act-when">
                          <strong>{w.day}</strong>
                          <span>{w.time}</span>
                        </td>
                        <td>
                          <strong>{row.actorName || row.actorEmail || '—'}</strong>
                        </td>
                        <td>
                          <Badge tone={a.tone}>{a.label}</Badge> <span className="act-event">{plainEvent(row.event)}</span>
                        </td>
                        <td className="act-record" title={row.recordId ?? undefined}>
                          {row.sourceLabel}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </BookOneShell>
  );
}
