import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  getCommercialDocument,
  updateCommercialDocumentHeaderFromForm,
} from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenant;
  let doc;
  try {
    [tenant, doc] = await Promise.all([getTenantInfo(), getCommercialDocument(id)]);
  } catch {
    redirect('/login');
  }
  if (!doc || doc.documentType !== 'quotation') redirect('/sales/quotations');
  if (doc.status === 'converted') redirect('/sales/quotations');

  return (
    <BookOneShell active="Quotations" tenant={tenant}>
      <div className="workspace party-workspace">
        <form action={updateCommercialDocumentHeaderFromForm} className="doc-form-shell">
          <input type="hidden" name="id" value={doc.id} />
          <input type="hidden" name="documentType" value="quotation" />

          <div className="party-form-top">
            <Link href="/sales/quotations" className="party-back-btn">
              <span className="party-back-arrow">←</span>
              <span>
                <strong>Back to list</strong>
                <small>Quotations</small>
              </span>
            </Link>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong style={{ fontSize: 14 }}>{doc.documentNumber}</strong>
              <StatusBadge status={doc.status} />
            </div>
          </div>

          <div className="doc-form-scroll">
            <div className="doc-form-header">
              <div className="field field-span-2">
                <label>Customer</label>
                <input className="input" value={doc.partyName} disabled />
              </div>
              <div className="field">
                <label>Quote date</label>
                <input className="input" name="issueDate" type="date" defaultValue={doc.issueDate} required />
              </div>
              <div className="field">
                <label>Good thru</label>
                <input className="input" name="dueDate" type="date" defaultValue={doc.dueDate ?? ''} />
              </div>
              <div className="field">
                <label>Status</label>
                <select className="input" name="status" defaultValue={doc.status}>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="accepted">Accepted</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="field field-span-2">
                <label>Notes</label>
                <input className="input" name="notes" defaultValue={doc.notes ?? ''} />
              </div>
            </div>

            <div className="doc-lines-card">
              <div className="doc-lines-head">
                <span>Lines (read-only on this screen)</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{formatLKR(doc.total)}</span>
              </div>
              <div className="doc-lines-scroll">
                <table className="doc-lines-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="col-qty">Qty</th>
                      <th className="col-price">Unit price</th>
                      <th className="col-amt">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.description}</td>
                        <td className="num">{l.quantity}</td>
                        <td className="num">{l.unitPrice.toFixed(2)}</td>
                        <td className="num">{l.lineTotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: 0 }}>
              Line items cannot be rewritten after save yet. Create a new quotation if products must change.
            </p>
          </div>

          <div className="doc-form-footer">
            <Link href="/sales/quotations">
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </Link>
            <Button variant="primary" type="submit">
              Save changes
            </Button>
          </div>
        </form>
      </div>
    </BookOneShell>
  );
}
