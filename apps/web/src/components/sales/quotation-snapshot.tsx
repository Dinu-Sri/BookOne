'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import type { CommercialDocDetail } from '@/app/actions/commercial-docs';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';

export function QuotationSnapshotDialog({
  doc,
  onClose,
}: {
  doc: CommercialDocDetail;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel party-snapshot"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-snapshot-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 100%)' }}
      >
        <button className="party-snapshot-close" type="button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <div className="party-snapshot-hero">
          <div className="party-snapshot-avatar" aria-hidden>
            Q
          </div>
          <div className="party-snapshot-hero-text">
            <p className="party-snapshot-kicker">Quotation</p>
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
            <span>Good thru</span>
            <strong>{doc.dueDate || '—'}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{formatLKR(doc.total)}</strong>
          </div>
        </div>

        <div className="table-wrap" style={{ marginTop: 12, maxHeight: 220, overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td>{l.quantity}</td>
                  <td>{formatLKR(l.unitPrice)}</td>
                  <td>{formatLKR(l.lineTotal)}</td>
                </tr>
              ))}
              {doc.lines.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--ink-soft)' }}>
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
          <Link href={`/sales/quotations/${doc.id}/edit`}>
            <Button variant="primary" type="button">
              Edit
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
