import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPurchasePrintData } from '@/app/actions/commercial-docs';
import { formatLKR } from '@/components/module/list-page';

const TITLE: Record<string, string> = {
  purchase_order: 'PURCHASE ORDER',
  purchase: 'PURCHASE BILL',
  import_purchase: 'IMPORT PURCHASE',
  cash_purchase: 'CASH PURCHASE',
  goods_receipt: 'GOODS RECEIVED NOTE',
  purchase_return: 'PURCHASE RETURN / CREDIT',
  vendor_bill: 'VENDOR BILL',
};

export default async function PurchasePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    data = await getPurchasePrintData(id);
  } catch {
    redirect('/login');
  }
  if (!data) redirect('/purchase/purchases');

  const { doc, company } = data;
  const title = TITLE[doc.documentType] ?? 'PURCHASE DOCUMENT';
  const companyName = company?.legalName ?? company?.tradingName ?? 'Company';
  const companyAddress = [company?.addressLine1, company?.addressLine2, company?.city, company?.postalCode]
    .filter(Boolean)
    .join(', ');
  const back =
    doc.documentType === 'purchase_order'
      ? `/purchase/orders/${doc.id}`
      : doc.documentType === 'cash_purchase'
        ? `/purchase/expenses/${doc.id}`
        : doc.documentType === 'import_purchase'
          ? `/purchase/import/${doc.id}`
          : doc.documentType === 'goods_receipt'
            ? `/purchase/receipts/${doc.id}`
            : doc.documentType === 'purchase_return'
              ? `/purchase/returns/${doc.id}`
              : `/purchase/purchases/${doc.id}`;

  return (
    <div className="tax-invoice-print-root">
      <div className="tax-invoice-toolbar no-print">
        <Link href={back}>← Back</Link>
        <button type="button" id="purchase-print-btn">
          Print
        </button>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.getElementById('purchase-print-btn')?.addEventListener('click',function(){window.print();});`,
          }}
        />
      </div>

      <article className="tax-invoice-sheet">
        <h1>{title}</h1>

        <div className="tax-invoice-meta" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <strong>{companyName}</strong>
            <div style={{ fontSize: 13 }}>{companyAddress || '—'}</div>
            {company?.phone ? <div style={{ fontSize: 13 }}>Tel: {company.phone}</div> : null}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>
              <strong>No.:</strong> {doc.documentNumber}
            </div>
            <div>
              <strong>Date:</strong> {doc.issueDate}
            </div>
            {doc.dueDate ? (
              <div>
                <strong>Due:</strong> {doc.dueDate}
              </div>
            ) : null}
            {doc.deliveryDate ? (
              <div>
                <strong>Delivery:</strong> {doc.deliveryDate}
              </div>
            ) : null}
            {doc.supplierInvoiceNumber ? (
              <div>
                <strong>Supplier inv:</strong> {doc.supplierInvoiceNumber}
              </div>
            ) : null}
            {doc.paymentMode ? (
              <div>
                <strong>Terms:</strong> {doc.paymentMode}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <strong>Vendor</strong>
          <div>{doc.partyName}</div>
        </div>

        <table className="table" style={{ marginTop: 20, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Description</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Unit price</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td style={{ textAlign: 'right' }}>{l.quantity}</td>
                <td style={{ textAlign: 'right' }}>{formatLKR(l.unitPrice)}</td>
                <td style={{ textAlign: 'right' }}>{formatLKR(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <div>Subtotal: {formatLKR(doc.subtotal)}</div>
          {doc.discountTotal > 0 ? <div>Discount: {formatLKR(doc.discountTotal)}</div> : null}
          <div style={{ fontWeight: 800, fontSize: 16, marginTop: 6 }}>Total: {formatLKR(doc.total)}</div>
          {doc.balanceDue > 0.005 ? (
            <div style={{ marginTop: 4 }}>Balance due: {formatLKR(doc.balanceDue)}</div>
          ) : null}
        </div>

        {doc.notes ? (
          <p style={{ marginTop: 24, fontSize: 13 }}>
            <strong>Notes:</strong> {doc.notes}
          </p>
        ) : null}
      </article>
    </div>
  );
}
