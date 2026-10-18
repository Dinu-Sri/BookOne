'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { persistedDocumentBreakdown } from '@bookone/accounting';
import type { CommercialDocDetail } from '@/app/actions/commercial-docs';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';

const SNAPSHOT_BY_TYPE: Record<string, { kicker: string; dateLabel: string; avatar: string }> = {
  quotation: { kicker: 'Quotation', dateLabel: 'Good thru', avatar: 'Q' },
  sales_order: { kicker: 'Sales order', dateLabel: 'Dispatch by', avatar: 'SO' },
  sales_invoice: { kicker: 'Invoice', dateLabel: 'Due date', avatar: 'INV' },
  customer_invoice: { kicker: 'Invoice', dateLabel: 'Due date', avatar: 'INV' },
  sales_return: { kicker: 'Sales return', dateLabel: 'Date', avatar: 'SR' },
  purchase_order: { kicker: 'Purchase order', dateLabel: 'Due date', avatar: 'PO' },
  purchase: { kicker: 'Purchase', dateLabel: 'Due date', avatar: 'BILL' },
  vendor_bill: { kicker: 'Vendor bill', dateLabel: 'Due date', avatar: 'BILL' },
  import_purchase: { kicker: 'Import purchase', dateLabel: 'Due date', avatar: 'IMP' },
  cash_purchase: { kicker: 'Cash purchase', dateLabel: 'Date', avatar: 'EXP' },
  goods_receipt: { kicker: 'Goods receipt', dateLabel: 'Date', avatar: 'GRN' },
  purchase_return: { kicker: 'Purchase return', dateLabel: 'Date', avatar: 'PR' },
};

function snapshotMeta(doc: CommercialDocDetail, fallbackTitle?: string) {
  const mapped = SNAPSHOT_BY_TYPE[doc.documentType];
  const kicker = mapped?.kicker ?? fallbackTitle ?? 'Document';
  return {
    kicker,
    dateLabel: mapped?.dateLabel ?? 'Due date',
    avatar: mapped?.avatar ?? kicker.slice(0, 2).toUpperCase(),
  };
}

export function QuotationSnapshotDialog({
  doc,
  onClose,
  listTitle,
  editHref,
}: {
  doc: CommercialDocDetail;
  onClose: () => void;
  listTitle?: string;
  editHref?: string | null;
}) {
  const meta = snapshotMeta(doc, listTitle);
  const isReturn = doc.documentType === 'sales_return' || doc.documentType === 'purchase_return';
  const breakdown = isReturn
    ? persistedDocumentBreakdown(doc.lines, doc.subtotal, doc.discountTotal, doc.taxTotal, doc.total)
    : null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel party-snapshot"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-snapshot-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: breakdown ? 'min(720px, 100%)' : 'min(560px, 100%)' }}
      >
        <button className="party-snapshot-close" type="button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <div className="party-snapshot-hero">
          <div className="party-snapshot-avatar" aria-hidden>
            {meta.avatar}
          </div>
          <div className="party-snapshot-hero-text">
            <p className="party-snapshot-kicker">{meta.kicker}</p>
            <h2 id="quote-snapshot-title">{doc.documentNumber}</h2>
            <div className="party-snapshot-meta">
              <StatusBadge status={doc.status} />
              <span className="party-snapshot-chip">{doc.partyName}</span>
            </div>
          </div>
        </div>

        <div className="party-snapshot-metrics">
          <div>
            <span>Date</span>
            <strong>{doc.issueDate}</strong>
          </div>
          <div>
            <span>{meta.dateLabel}</span>
            <strong>{doc.dueDate || '—'}</strong>
          </div>
          <div>
            <span>{isReturn ? 'Credit' : 'Total'}</span>
            <strong>{formatLKR(doc.total)}</strong>
          </div>
        </div>

        {breakdown ? (
          <div className="party-snapshot-metrics" style={{ marginTop: 8 }}>
            <div>
              <span>Line net</span>
              <strong>{formatLKR(breakdown.lineNet)}</strong>
            </div>
            <div>
              <span>Header allocation</span>
              <strong>{formatLKR(breakdown.headerDiscount)}</strong>
            </div>
            <div>
              <span>After header</span>
              <strong>{formatLKR(breakdown.supplyNet)}</strong>
            </div>
            {breakdown.tax > 0 ? (
              <div>
                <span>VAT</span>
                <strong>{formatLKR(breakdown.tax)}</strong>
              </div>
            ) : null}
            {breakdown.allocationAdjustment !== 0 ? (
              <div>
                <span>Allocation adjustment</span>
                <strong>{formatLKR(breakdown.allocationAdjustment)}</strong>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="table-wrap" style={{ marginTop: 12, maxHeight: 220, overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Price</th>
                {breakdown ? (
                  <>
                    <th>Gross</th>
                    <th>Discount</th>
                    <th>Net</th>
                  </>
                ) : (
                  <th>Amount</th>
                )}
              </tr>
            </thead>
            <tbody>
              {(breakdown ? breakdown.lines : doc.lines).map((l, i) => (
                <tr key={'id' in l ? l.id : `${l.description}-${i}`}>
                  <td>
                    {l.description}
                    {'allocationAdjustment' in l && l.allocationAdjustment !== 0
                      ? ` (adj ${formatLKR(l.allocationAdjustment)})`
                      : ''}
                  </td>
                  <td>{l.quantity}</td>
                  <td>{formatLKR(l.unitPrice)}</td>
                  {breakdown && 'gross' in l ? (
                    <>
                      <td>{formatLKR(l.gross)}</td>
                      <td>{formatLKR(l.discount)}</td>
                      <td>{formatLKR(l.net)}</td>
                    </>
                  ) : (
                    <td>{formatLKR('lineTotal' in l ? l.lineTotal : 0)}</td>
                  )}
                </tr>
              ))}
              {doc.lines.length === 0 ? (
                <tr>
                  <td colSpan={breakdown ? 6 : 4} style={{ color: 'var(--ink-soft)' }}>
                    No lines
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {doc.notes ? (
          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-muted)' }}>
            <strong>Notes:</strong> {doc.notes}
          </p>
        ) : null}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Close
          </Button>
          {editHref ? (
            <Link href={editHref}>
              <Button variant="primary" type="button">
                Edit
              </Button>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
