'use client';

import Link from 'next/link';
import { ArrowRight, Landmark } from 'lucide-react';
import type { ReconSessionListItem } from '@/app/actions/bank-reconciliation';

function formatRs(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(n).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function tone(status: string) {
  if (status === 'reconciled') return 'ok';
  if (status === 'in_progress') return 'warn';
  return 'need';
}

/**
 * Session-first inbox (bank account + period).
 * Spec: primary recon object is not the filename.
 */
export function ReconciliationInbox({
  sessions,
  importHref,
  sessionBase,
}: {
  sessions: ReconSessionListItem[];
  importHref: string;
  /** e.g. /reconciliation/session or /cashbook/recon */
  sessionBase: string;
}) {
  return (
    <div className="bih-hub">
      <div className="bih-hub-actions">
        <Link href={importHref} className="bis-btn primary">
          Import bank file
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="bih-empty">
          <Landmark size={28} />
          <strong>No reconciliations yet</strong>
          <p>
            Import a bank Excel or CSV. BookOne groups it by bank account and statement period so you
            can match safely.
          </p>
          <Link href={importHref} className="bis-btn secondary">
            Import bank file
          </Link>
        </div>
      ) : (
        <ul className="bih-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link href={`${sessionBase}/${s.id}`} className="bih-card">
                <div className="bih-card-top">
                  <strong className="bih-file">
                    {s.bankName}
                    {s.bankCode ? ` · ${s.bankCode}` : ''}
                  </strong>
                  <span className={`bih-badge ${tone(s.status)}`}>{s.statusLabel}</span>
                </div>
                <div className="bih-meta">
                  <span>{s.periodLabel}</span>
                  <span>
                    {s.sourceFileCount} source file{s.sourceFileCount === 1 ? '' : 's'}
                  </span>
                  <span>{s.bankLineCount} bank lines</span>
                </div>
                <div className="brw-progress-row">
                  <div className="brw-progress-bar" aria-hidden>
                    <i style={{ width: `${s.progressPct}%` }} />
                  </div>
                  <span>
                    {s.resolvedCaseCount} resolved · {s.openCaseCount} open
                  </span>
                </div>
                <div className="bih-counts">
                  {Math.abs(s.differenceAmount) > 0.009 ? (
                    <span className="warn">
                      Difference <strong>{formatRs(s.differenceAmount)}</strong>
                    </span>
                  ) : (
                    <span className="ok">
                      Difference <strong>Rs. 0.00</strong>
                    </span>
                  )}
                </div>
                <div className="bih-cta">
                  <span>{s.openCaseCount > 0 ? 'Continue' : 'Open'}</span>
                  <ArrowRight size={16} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
