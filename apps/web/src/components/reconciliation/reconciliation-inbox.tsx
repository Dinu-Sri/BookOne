'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { ArrowRight, Landmark, Trash2 } from 'lucide-react';
import { Button, Card, Badge } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { pushStatusToast } from '@/components/layout/status-toast';
import {
  listBankImports,
  voidBankImport,
  type ReconSessionListItem,
} from '@/app/actions/bank-reconciliation';

function formatRs(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(n).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function statusTone(status: string): 'success' | 'warning' | 'info' | 'neutral' {
  if (status === 'reconciled') return 'success';
  if (status === 'in_progress') return 'info';
  if (status === 'ready') return 'warning';
  return 'neutral';
}

const PAGE_SIZE = 10;

/**
 * Session-first inbox — party/product list patterns (workspace + Card + table + pagination).
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
        // Sessions may need server refresh
        window.location.reload();
      });
    });
  }

  return (
    <div className="workspace party-workspace bih-hub-root">
      <div className="party-toolbar">
        <div className="party-search-form">
          <input
            className="input party-search"
            placeholder="Search bank or period…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            aria-label="Search reconciliations"
          />
        </div>
        {showImportButton ? (
          <Link href={importHref}>
            <Button variant="primary" type="button">
              Import bank file
            </Button>
          </Link>
        ) : null}
      </div>

      <p className="bih-lead">
        Each row is a bank account and statement period. Import files are evidence — match them to
        BookOne here.
      </p>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {slice.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              <Landmark size={28} style={{ opacity: 0.5 }} />
              <h3>No reconciliations yet</h3>
              <p>Import a bank Excel or CSV. BookOne groups by bank account and period.</p>
              <div style={{ marginTop: 12 }}>
                <Link href={importHref}>
                  <Button variant="primary" type="button">
                    Import bank file
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="table-wrap table-wrap-actions">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Bank</th>
                      <th>Period</th>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Difference</th>
                      <th className="th-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slice.map((s) => {
                      const open = s.openCaseCount;
                      const cta =
                        open > 0 ? 'Continue' : s.status === 'reconciled' ? 'View' : 'Open';
                      return (
                        <tr key={s.id}>
                          <td>
                            <strong>
                              {s.bankName}
                              {s.bankCode ? ` · ${s.bankCode}` : ''}
                            </strong>
                            <div className="bih-meta-inline">
                              {s.sourceFileCount} file{s.sourceFileCount === 1 ? '' : 's'} ·{' '}
                              {s.bankLineCount} lines
                            </div>
                          </td>
                          <td>{s.periodLabel}</td>
                          <td>
                            <Badge tone={statusTone(s.status)}>{s.statusLabel}</Badge>
                          </td>
                          <td>
                            <div className="brw-progress-row compact">
                              <div className="brw-progress-bar" aria-hidden>
                                <i style={{ width: `${s.progressPct}%` }} />
                              </div>
                              <span>
                                {s.resolvedCaseCount} / {s.resolvedCaseCount + open}
                              </span>
                            </div>
                          </td>
                          <td>
                            <strong
                              className={
                                Math.abs(s.differenceAmount) > 0.009 ? 'text-warn' : 'text-ok'
                              }
                            >
                              {formatRs(s.differenceAmount)}
                            </strong>
                          </td>
                          <td className="td-actions">
                            <Link href={`${sessionBase}/${s.id}`}>
                              <Button variant="secondary" type="button">
                                {cta} <ArrowRight size={14} />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="party-pagination">
                <span>
                  {filtered.length} total · page {safePage} of {totalPages}
                </span>
                {filtered.length > PAGE_SIZE ? (
                  <div className="party-pagination-actions">
                    <Button
                      variant="secondary"
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </Card>

      {imports.length > 0 ? (
        <Card className="bih-imports-card">
          <div className="card-header" style={{ padding: '12px 16px' }}>
            <div>
              <h2 className="card-title" style={{ fontSize: 16 }}>
                Imported bank files
              </h2>
              <p className="card-subtitle">
                Remove a file if it was uploaded by mistake. Posted cashbook entries are not reversed.
              </p>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Bank</th>
                    <th>Period</th>
                    <th>Lines</th>
                    <th className="th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((imp) => (
                    <tr key={imp.id}>
                      <td>
                        <strong>{imp.fileName}</strong>
                      </td>
                      <td>{imp.bankName}</td>
                      <td>{imp.periodLabel}</td>
                      <td>{imp.lineCount}</td>
                      <td className="td-actions">
                        <Button
                          variant="ghost"
                          type="button"
                          disabled={pending}
                          onClick={() => setDeleteId(imp.id)}
                          title="Delete import"
                        >
                          <Trash2 size={16} />
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      ) : null}

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
