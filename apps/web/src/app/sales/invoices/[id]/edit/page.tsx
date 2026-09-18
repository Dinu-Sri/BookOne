import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  getCommercialDocument,
  updateCommercialDocumentHeaderFromForm,
} from '@/app/actions/commercial-docs';
import { getSalesSettings } from '@/app/actions/sales-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';
import { PrintPreviewButton } from '@/components/print/print-preview-button';

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenant;
  let doc;
  let settings;
  try {
    [tenant, doc, settings] = await Promise.all([
      getTenantInfo(),
      getCommercialDocument(id),
      getSalesSettings(),
    ]);
  } catch {
    redirect('/login');
  }
  if (!doc || !['sales_invoice', 'customer_invoice'].includes(doc.documentType)) {
    redirect('/sales/invoices');
  }
  if (doc.status === 'void' || doc.status === 'paid') redirect(`/sales/invoices/${doc.id}`);
  if (settings.editLockDays > 0) {
    const issued = new Date(`${doc.issueDate}T00:00:00`);
    const age = Math.floor((Date.now() - issued.getTime()) / 86400000);
    if (age > settings.editLockDays) redirect(`/sales/invoices/${doc.id}`);
  }

  return (
    <BookOneShell active="Sales Invoices" tenant={tenant}>
      <div className="workspace party-workspace">
        <form action={updateCommercialDocumentHeaderFromForm} className="doc-form-shell">
          <input type="hidden" name="id" value={doc.id} />
          <input type="hidden" name="documentType" value="sales_invoice" />
          <div className="party-form-top">
            <Link href="/sales/invoices" className="party-back-btn">
              <span className="party-back-arrow">←</span>
              <span>
                <strong>Back to list</strong>
                <small>Invoices</small>
              </span>
            </Link>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <PrintPreviewButton documentId={doc.id} />
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
                <label>Invoice date</label>
                <input className="input" name="issueDate" type="date" defaultValue={doc.issueDate} required />
              </div>
              <div className="field">
                <label>Due date</label>
                <input className="input" name="dueDate" type="date" defaultValue={doc.dueDate ?? ''} />
              </div>
              <div className="field field-span-2">
                <label>Notes</label>
                <input className="input" name="notes" defaultValue={doc.notes ?? ''} />
              </div>
            </div>
            <div className="doc-lines-card">
              <div className="doc-lines-head">
                <span>Lines</span>
                <span style={{ fontWeight: 700 }}>{formatLKR(doc.total)}</span>
              </div>
              <div className="doc-lines-scroll">
                <table className="doc-lines-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="col-qty">Qty</th>
                      <th className="col-price">Price</th>
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
            <p className="muted-line">Line items are not rewritten here. Create a credit note or new invoice if products must change.</p>
          </div>
          <div className="doc-form-footer">
            <Link href="/sales/invoices">
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
