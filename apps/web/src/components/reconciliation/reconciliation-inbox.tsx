'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { ArrowRight, FileSpreadsheet, Trash2 } from 'lucide-react';
import { Button, Badge } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SearchField } from '@/components/ui/text-field';
import { pushStatusToast } from '@/components/layout/status-toast';
import { listBankImports, voidBankImport, type ReconSessionListItem } from '@/app/actions/bank-reconciliation';

function formatRs(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(n).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusTone(status: string): 'success' | 'warning' | 'info' | 'neutral' {
  if (status === 'reconciled') return 'success';
  if (status === 'in_progress') return 'info';
  if (status === 'ready') return 'warning';
  return 'neutral';
}

const PAGE_SIZE = 10;

/**
 * Bank reconciliation home: one row per bank account and statement period,
 * with what is left to do, plus a short "how it works" for new users.
 */
export function ReconciliationInbox({
  sessions,
  importHref,
  sessionBase,
  showImportButton = true,
  initialImports = [],
}: {
  sessions: ReconSessionListItem[];
  importHref: string;
  sessionBase: string;
  showImportButton?: boolean;
  initialImports?: Awaited<ReturnType<typeof listBankImports>>;
}) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [imports, setImports] = useState(initialImports);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return sessions;
    return sessions.filter(
      (s) =>
        s.bankName.toLowerCase().includes(qq) ||
        s.bankCode.toLowerCase().includes(qq) ||
        s.periodLabel.toLowerCase().includes(qq) ||
        s.statusLabel.toLowerCase().includes(qq),
    );
  }, [sessions, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const openCount = sessions.filter((s) => s.status !== 'reconciled').length;
  // For each bank with nothing open: how far it is reconciled, and the next month to do.
  const nextUp = useMemo(() => {
    const byBank = new Map<string, ReconSessionListItem[]>();
    for (const s of sessions) byBank.set(s.bankAccountId, [...(byBank.get(s.bankAccountId) ?? []), s]);
    const out: Array<{ bank: string; through: string; next: string }> = [];
    for (const list of byBank.values()) {
      if (list.some((s) => s.status !== 'reconciled')) continue;
      const last = [...list].sort((a, b) => (a.periodTo < b.periodTo ? 1 : -1))[0];
      if (!last) continue;
      const end = new Date(`${last.periodTo}T12:00:00`);
      const next = new Date(end.getFullYear(), end.getMonth() + 1, 1);
      out.push({
        bank: last.bankName,
        through: end.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        next: next.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      });
    }
    return out;
  }, [sessions]);

  function doDelete() {
    if (!deleteId) return;
    startTransition(() => {
      voidBankImport(deleteId).then((res) => {
        if (!res.ok) {
          pushStatusToast({ kind: 'error', message: res.error });
          return;
        }
        setImports((prev) => prev.filter((i) => i.id !== deleteId));
        setDeleteId(null);
        pushStatusToast({ kind: 'success', message: 'Import removed successfully' });
        window.location.reload();
      });
    });
  }

  return (
    <div className="rin">
      <div className="rin-main">
        {sessions.length > 6 || showImportButton ? (
          <div className="rin-toolbar">
            {sessions.length > 6 ? (
              <SearchField
                id="rin-search"
                label="Search reconciliations"
                value={q}
                onChange={(v) => {
                  setQ(v);
                  setPage(1);
                }}
                placeholder="Search bank or month…"
              />
            ) : (
              <span />
            )}
            {showImportButton ? (
              <Link href={importHref} className="button primary">
                Import bank statement
              </Link>
            ) : null}
          </div>
        ) : null}

        {sessions.length === 0 ? (
          <section className="rin-empty">
            <FileSpreadsheet size={32} aria-hidden />
            <h2>No reconciliations yet</h2>
            <p>Start with last month&apos;s statement from your bank&apos;s internet banking, saved as Excel or CSV.</p>
            <Link href={importHref} className="button primary">
              Import bank statement
            </Link>
          </section>
        ) : (
          <section className="rin-card" aria-label="Reconciliations">
            <header className="rin-card-head">
              <h2>Your reconciliations</h2>
              <span>{openCount === 0 ? 'All finished' : `${openCount} to finish`}</span>
            </header>
            <div className="table-wrap">
              <table className="table rin-table">
                <thead>
                  <tr>
                    <th>Bank account and month</th>
                    <th>Status</th>
                    <th className="rin-num">Left to explain</th>
                    <th className="th-actions">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map((s) => {
                    const open = s.openCaseCount;
                    const total = s.resolvedCaseCount + open;
                    const cta = open > 0 ? 'Continue' : s.status === 'reconciled' ? 'View' : 'Open';
                    const leftOk = s.differenceVerified && Math.abs(s.differenceAmount) <= 0.009;
                    return (
                      <tr key={s.id}>
                        <td className="rin-what">
                          <strong>
                            {s.bankName} · {s.periodLabel}
                          </strong>
                          <div className="rin-meta">
                            {s.bankCode ? `${s.bankCode} · ` : ''}
                            {s.bankLineCount} bank lines
                          </div>
                        </td>
                        <td className="rin-status">
                          <Badge tone={statusTone(s.status)}>{s.statusLabel}</Badge>
                          <div className="rin-progress">
                            <span className="rin-progress-bar" aria-hidden>
                              <i style={{ width: `${s.progressPct}%` }} />
                            </span>
                            <span>
                              {s.resolvedCaseCount} of {total} done
                            </span>
                          </div>
                        </td>
                        <td className="rin-num" data-testid="recon-inbox-difference">
                          {s.differenceVerified ? (
                            <strong className={leftOk ? 'text-ok' : 'text-warn'}>{formatRs(s.differenceAmount)}</strong>
                          ) : (
                            <span className="rin-meta">Unverified</span>
                          )}
                        </td>
                        <td className="td-actions">
                          <Link href={`${sessionBase}/${s.id}`} className={`button ${open > 0 ? 'primary' : 'secondary'}`}>
                            {cta} <ArrowRight size={14} aria-hidden />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > PAGE_SIZE ? (
              <div className="party-pagination">
                <span>
                  {filtered.length} total · page {safePage} of {totalPages}
                </span>
                <div className="party-pagination-actions">
                  <Button variant="secondary" type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Previous
                  </Button>
                  <Button variant="secondary" type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        )}

        {nextUp.length > 0 ? (
          <section className="rin-next" aria-label="What is next">
            {nextUp.map((n) => (
              <div key={n.bank} className="rin-next-row">
                <div>
                  <strong>{n.bank} is reconciled to {n.through}.</strong>
                  <span>Next: the {n.next} statement, once the month has ended.</span>
                </div>
                <Link href={importHref} className="button secondary">
                  Import {n.next.split(' ')[0]}
                </Link>
              </div>
            ))}
          </section>
        ) : null}

        {imports.length > 0 ? (
          <details className="rin-files">
            <summary>
              Imported statement files <span>{imports.length}</span>
            </summary>
            <p className="field-help">Delete a file only if it was uploaded by mistake. Entries already added to BookOne stay.</p>
            <ul>
              {imports.map((imp) => (
                <li key={imp.id}>
                  <FileSpreadsheet size={16} aria-hidden />
                  <strong>{imp.fileName}</strong>
                  <span>{imp.bankName}</span>
                  <span>{imp.periodLabel}</span>
                  <span>{imp.lineCount} lines</span>
                  <Button variant="ghost" type="button" disabled={pending} onClick={() => setDeleteId(imp.id)} title="Delete import">
                    <Trash2 size={15} aria-hidden />
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <aside className="rin-guide" aria-label="How bank reconciliation works">
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>Import the statement</strong>
            <span>Download the month from your bank as Excel or CSV and upload it.</span>
          </li>
          <li>
            <strong>Match and add</strong>
            <span>Confirm lines that are already in BookOne. Add bank charges or interest the bank recorded.</span>
          </li>
          <li>
            <strong>Mark late items</strong>
            <span>Cheques or deposits that reach the bank next month wait to clear.</span>
          </li>
          <li>
            <strong>Finish at 0</strong>
            <span>When nothing is left to explain, review and finish the month.</span>
          </li>
        </ol>
        <div className="rin-guide-links">
          <a href="/docs/accounting/bank-reconciliation" target="_blank" rel="noopener noreferrer">
            Step-by-step guide
          </a>
          <a href="/samples/sample-bank-statement-october-2026.csv" download>
            Practice statement (CSV)
          </a>
        </div>
      </aside>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete bank import?"
        message="This removes the imported statement lines from reconciliation. Cashbook journals already posted are not reversed."
        confirmLabel="Delete import"
        tone="danger"
        busy={pending}
        onCancel={() => setDeleteId(null)}
        onConfirm={doDelete}
      />
    </div>
  );
}
