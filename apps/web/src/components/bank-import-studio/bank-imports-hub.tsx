'use client';

import Link from 'next/link';
import { FileSpreadsheet, Landmark, ArrowRight } from 'lucide-react';
import type { BankImportHubItem } from '@/app/actions/statement-import';

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusTone(s: BankImportHubItem['displayStatus']): string {
  switch (s) {
    case 'done':
      return 'ok';
    case 'in_progress':
    case 'ready_to_create':
      return 'warn';
    case 'draft':
      return 'muted';
    default:
      return 'need';
  }
}

/**
 * Shared Bank Imports inbox — cashbook + full ERP.
 * List only; workbench is BankMatchWizard on match/recon detail URL.
 */
export function BankImportsHub({
  items,
  importHref,
  workbenchBase,
  emptyHint,
}: {
  items: BankImportHubItem[];
  /** Studio upload */
  importHref: string;
  /**
   * Path prefix for opening an import workbench.
   * Cashbook: `/cashbook/match`  ERP: `/reconciliation`
   * Final URL: `${workbenchBase}?importId=`
   */
  workbenchBase: string;
  emptyHint?: string;
}) {
  return (
    <div className="bih-hub">
      <div className="bih-hub-actions">
        <Link href={importHref} className="bis-btn primary">
          <FileSpreadsheet size={16} />
          Import bank file
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="bih-empty">
          <Landmark size={28} />
          <strong>No bank files yet</strong>
          <p>
            {emptyHint ??
              'Import an Excel or CSV from your bank. Lines stay in staging until you match or create.'}
          </p>
          <Link href={importHref} className="bis-btn secondary">
            Import bank file
          </Link>
        </div>
      ) : (
        <ul className="bih-list">
          {items.map((item) => {
            const href = `${workbenchBase}?importId=${item.id}`;
            return (
              <li key={item.id}>
                <Link href={href} className="bih-card">
                  <div className="bih-card-top">
                    <strong className="bih-file" title={item.fileName}>
                      {item.fileName}
                    </strong>
                    <span className={`bih-badge ${statusTone(item.displayStatus)}`}>
                      {item.displayLabel}
                    </span>
                  </div>
                  <div className="bih-meta">
                    {item.bankName ? <span>{item.bankName}</span> : null}
                    <span>{item.periodLabel}</span>
                    <span>{formatWhen(item.createdAt)}</span>
                  </div>
                  <div className="bih-counts">
                    <span>
                      <strong>{item.rowCount}</strong> lines
                    </span>
                    <span className="ok">
                      <strong>{item.linkedCount}</strong> linked
                    </span>
                    <span className="warn">
                      <strong>{item.openCount}</strong> open
                    </span>
                    <span className="info">
                      <strong>{item.createdCount}</strong> created
                    </span>
                    {item.duplicateCount > 0 ? (
                      <span className="muted">
                        <strong>{item.duplicateCount}</strong> dup
                      </span>
                    ) : null}
                  </div>
                  <div className="bih-cta">
                    <span>
                      {item.displayStatus === 'draft'
                        ? 'Open import'
                        : item.displayStatus === 'done'
                          ? 'View'
                          : 'Continue match'}
                    </span>
                    <ArrowRight size={16} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
