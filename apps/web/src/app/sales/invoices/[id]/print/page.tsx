import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDateMmDdYyyy } from '@bookone/accounting';
import { getInvoicePrintData } from '@/app/actions/commercial-docs';

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    data = await getInvoicePrintData(id);
  } catch {
    redirect('/login');
  }
  if (!data) redirect('/sales/invoices');

  const { doc, party, lines, company, tax } = data;
  const isTax = doc.invoiceKind === 'tax_invoice';
  const supply = Number(doc.subtotal);
  const vat = Number(doc.taxTotal);
  const total = Number(doc.total);
  const vatRate = Number(doc.vatRate);

  const supplierName = company?.legalName ?? company?.tradingName ?? 'Supplier';
  const supplierAddress = [company?.addressLine1, company?.addressLine2, company?.city, company?.postalCode]
    .filter(Boolean)
    .join(', ');
  const supplierPhone = company?.phone ?? '';
  const supplierTin = tax?.tin ?? '';

  const purchaserName = party?.legalName || party?.displayName || party?.name || '';
  const purchaserAddress = doc.purchaserAddress || party?.addressLine1 || party?.address || '';
  const purchaserPhone = doc.purchaserPhone || party?.phoneMobile || party?.phone || '';
  const purchaserTin = doc.purchaserTin || party?.tin || '';

  return (
    <div className="tax-invoice-print-root">
      <div className="tax-invoice-toolbar no-print">
        <Link href="/sales/invoices">← Back to invoices</Link>
        <button type="button" id="tax-invoice-print-btn">
          Print
        </button>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.getElementById('tax-invoice-print-btn')?.addEventListener('click',function(){window.print();});`,
          }}
        />
      </div>

      <article className="tax-invoice-sheet">
        <h1>{isTax ? 'TAX INVOICE' : 'SALES INVOICE'}</h1>

        <div className="tax-invoice-meta">
          <div>
            <strong>Date of invoice:</strong> {formatDateMmDdYyyy(doc.issueDate)}
          </div>
          <div>
            <strong>{isTax ? 'Tax invoice no.:' : 'Invoice no.:'}</strong> {doc.taxInvoiceNumber || doc.documentNumber}
          </div>
          <div>
            <strong>Date of delivery:</strong> {formatDateMmDdYyyy(doc.deliveryDate) || '—'}
          </div>
          <div>
            <strong>Place of supply:</strong> {doc.placeOfSupply || '—'}
          </div>
        </div>

        <div className="tax-invoice-parties">
          <section>
            <h2>Supplier</h2>
            <p>
              <strong>TIN:</strong> {supplierTin || '—'}
            </p>
            <p>
              <strong>Name:</strong> {supplierName}
            </p>
            <p>
              <strong>Address:</strong> {supplierAddress || '—'}
            </p>
            <p>
              <strong>Telephone:</strong> {supplierPhone || '—'}
            </p>
          </section>
          <section>
            <h2>Purchaser</h2>
            <p>
              <strong>TIN:</strong> {purchaserTin || '—'}
            </p>
            <p>
              <strong>Name:</strong> {purchaserName}
            </p>
            <p>
              <strong>Address:</strong> {purchaserAddress || '—'}
            </p>
            <p>
              <strong>Telephone:</strong> {purchaserPhone || '—'}
            </p>
          </section>
        </div>

        {(doc.additionalInfo || doc.notes) && (
          <p className="tax-invoice-extra">
            <strong>Additional information:</strong> {doc.additionalInfo || doc.notes}
          </p>
        )}

        <table className="tax-invoice-lines">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Description of goods or services</th>
              <th>Quantity</th>
              <th>Unit price</th>
              <th>Amount excluding VAT (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>{line.lineRef || '—'}</td>
                <td>{line.description}</td>
                <td className="num">{Number(line.quantity)}</td>
                <td className="num">{Number(line.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="num">{Number(line.lineTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="tax-invoice-totals">
          <tbody>
            <tr>
              <td>Total value of supply</td>
              <td className="num">{supply.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td>VAT amount{vatRate > 0 ? ` (total value of supply at ${vatRate}%)` : ''}</td>
              <td className="num">{vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td>
                <strong>Total amount including VAT</strong>
              </td>
              <td className="num">
                <strong>{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </td>
            </tr>
          </tbody>
        </table>

        <p className="tax-invoice-words">
          <strong>Total amount in words:</strong> {doc.amountInWords || '—'}
        </p>
        <p>
          <strong>Mode of payment:</strong> {doc.paymentMode || '—'}
          {' · '}
          <strong>Channel:</strong> {doc.saleChannel || 'local'}
          {doc.exportCountry ? ` · ${doc.exportCountry}` : ''}
        </p>
      </article>

      <style>{`
        .tax-invoice-toolbar { display:flex; gap:16px; padding:12px 16px; font-family: system-ui,sans-serif; }
        .tax-invoice-sheet { max-width: 820px; margin: 0 auto; padding: 16px 20px 40px; font-family: Arial, Helvetica, sans-serif; color:#111; font-size: 12px; }
        .tax-invoice-sheet h1 { text-align:center; letter-spacing:.06em; font-size: 20px; margin: 0 0 14px; }
        .tax-invoice-meta { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
        .tax-invoice-meta div { border:1px solid #333; padding:6px 8px; }
        .tax-invoice-parties { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
        .tax-invoice-parties section { border:1px solid #333; padding:10px; min-height:120px; }
        .tax-invoice-parties h2 { margin:0 0 8px; font-size:12px; text-transform:uppercase; }
        .tax-invoice-parties p { margin: 0 0 4px; }
        .tax-invoice-extra { border:1px solid #333; padding:8px; }
        .tax-invoice-lines, .tax-invoice-totals { width:100%; border-collapse:collapse; margin-top:10px; }
        .tax-invoice-lines th, .tax-invoice-lines td, .tax-invoice-totals td { border:1px solid #333; padding:6px 8px; }
        .tax-invoice-lines th { background:#f2f2f2; text-align:left; font-size:11px; }
        .num { text-align:right; white-space:nowrap; }
        .tax-invoice-words { border:1px solid #333; padding:8px; margin-top:12px; }
        @media print {
          .no-print, .tax-invoice-toolbar { display:none !important; }
          .tax-invoice-sheet { padding:0; max-width:none; }
          body { background:#fff; }
          .app-shell, .sidebar, .topbar { display:none !important; }
          .main { margin:0 !important; padding:0 !important; }
        }
      `}</style>
    </div>
  );
}
