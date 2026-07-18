'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  archiveCommercialDocument,
  convertDocumentAction,
  deleteCommercialDocument,
  type CommercialDocDetail,
} from '@/app/actions/commercial-docs';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { pushStatusToast } from '@/components/layout/status-toast';
import { Button, Card } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const TYPE_LABEL: Record<string, string> = {
  purchase_order: 'Purchase order',
  purchase: 'Purchase',
  import_purchase: 'Import purchase',
  purchase_return: 'Purchase return',
  vendor_bill: 'Vendor bill',
  sales_invoice: 'Invoice',
  customer_invoice: 'Invoice',
  quotation: 'Quotation',
  sales_order: 'Sales order',
  sales_return: 'Sales return',
  pos_sale: 'POS sale',
};

export function CommercialDocumentDetail({
  doc,
  listHref,
  listLabel,
  payHref,
  printHref,
  convertTo,
  convertLabel,
}: {
  doc: CommercialDocDetail;
  listHref: string;
  listLabel: string;
  payHref?: string | null;
  printHref?: string | null;
  convertTo?: 'sales_order' | 'sales_invoice' | 'purchase' | 'vendor_bill';
  convertLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<null | 'archive' | 'delete'>(null);
  const [busy, setBusy] = useState(false);

  const title = TYPE_LABEL[doc.documentType] ?? doc.documentType;
  const canPay = Boolean(payHref) && doc.balanceDue > 0.005 && Boolean(doc.transactionId);
  const canConvert =
    Boolean(convertTo) &&
    doc.status !== 'converted' &&
    doc.status !== 'void' &&
    doc.status !== 'fully_invoiced' &&
    doc.status !== 'paid';

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm === 'archive') {
        const res = await archiveCommercialDocument(doc.id);
        if (!res.ok) throw new Error(res.error);
        pushStatusToast({ kind: 'success', message: 'Archived' });
      } else {
        const res = await deleteCommercialDocument(doc.id);
        if (!res.ok) throw new Error(res.error);
        pushStatusToast({ kind: 'success', message: 'Deleted' });
        router.push(listHref);
        return;
      }
      setConfirm(null);
      startTransition(() => router.refresh());
    } catch (e) {
      pushStatusToast({ kind: 'error', message: e instanceof Error ? e.message : 'Action failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace party-workspace">
      <div className="party-form-top">
        <Link href={listHref} className="party-back-btn">
          <span className="party-back-arrow" aria-hidden>
            ←
          </span>
          <span>
            <strong>Back to list</strong>
            <small>{listLabel}</small>
          </span>
        </Link>
        <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {canPay && payHref ? (
            <Link href={payHref}>
              <Button variant="primary" type="button">
                Pay
              </Button>
            </Link>
          ) : null}
          {printHref ? (
            <Link href={printHref}>
              <Button variant="secondary" type="button">
                Print
              </Button>
            </Link>
          ) : null}
          {canConvert && convertTo ? (
            <form action={convertDocumentAction}>
              <input type="hidden" name="sourceId" value={doc.id} />
              <input type="hidden" name="targetType" value={convertTo} />
              <Button variant="secondary" type="submit" disabled={pending}>
                {convertLabel ?? 'Convert'}
              </Button>
            </form>
          ) : null}
          {doc.status !== 'converted' && doc.status !== 'void' ? (
            <Button variant="ghost" type="button" onClick={() => setConfirm('archive')} disabled={busy}>
              Archive
            </Button>
          ) : null}
          {!doc.transactionId ? (
            <Button variant="ghost" type="button" onClick={() => setConfirm('delete')} disabled={busy}>
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <div className="card-body" style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>{title}</p>
              <h1 style={{ margin: '4px 0 8px', fontSize: 22 }}>{doc.documentNumber}</h1>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <StatusBadge status={doc.status} />
                <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{doc.partyName}</span>
              </div>
            </div>
            <div className="doc-totals" style={{ minWidth: 200 }}>
              <div className="doc-totals-row">
                <span>Subtotal</span>
                <strong>{formatLKR(doc.subtotal)}</strong>
              </div>
              <div className="doc-totals-row">
                <span>Discount</span>
                <strong>{formatLKR(doc.discountTotal)}</strong>
              </div>
              {doc.taxTotal > 0 ? (
                <div className="doc-totals-row">
                  <span>Tax</span>
                  <strong>{formatLKR(doc.taxTotal)}</strong>
                </div>
              ) : null}
              <div className="doc-totals-row is-total">
                <span>Total</span>
                <strong>{formatLKR(doc.total)}</strong>
              </div>
              <div className="doc-totals-row">
                <span>Paid</span>
                <strong>{formatLKR(doc.paidAmount)}</strong>
              </div>
              <div className="doc-totals-row">
                <span>Balance due</span>
                <strong>{formatLKR(doc.balanceDue)}</strong>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 12,
              fontSize: 13,
            }}
          >
            <div>
              <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>Date</span>
              <div>
                <strong>{doc.issueDate}</strong>
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>Due</span>
              <div>
                <strong>{doc.dueDate || '—'}</strong>
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>Currency</span>
              <div>
                <strong>{doc.currency}</strong>
              </div>
            </div>
            {doc.transactionId ? (
              <div>
                <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>Journal</span>
                <div>
                  <Link href={`/journal?q=${doc.documentNumber}`} style={{ fontWeight: 700 }}>
                    Posted
                  </Link>
                </div>
              </div>
            ) : (
              <div>
                <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>GL</span>
                <div>
                  <strong>Not posted</strong>
                </div>
              </div>
            )}
          </div>

          {doc.notes ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
              <strong>Notes:</strong> {doc.notes}
            </p>
          ) : null}

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit price</th>
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
        </div>
      </Card>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm === 'delete' ? 'Delete document?' : 'Archive document?'}
        message={
          confirm === 'delete'
            ? `Soft-delete “${doc.documentNumber}”?`
            : `Archive “${doc.documentNumber}”?`
        }
        confirmLabel={confirm === 'delete' ? 'Delete' : 'Archive'}
        tone={confirm === 'delete' ? 'danger' : 'primary'}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
        busy={busy}
      />
    </div>
  );
}
