import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPosReceiptData } from '@/app/actions/pos-session';

export default async function PosReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  let data;
  try {
    data = await getPosReceiptData(id);
  } catch {
    redirect('/login');
  }
  if (!data) redirect('/pos');

  const { doc, party, lines, company, register } = data;
  const total = Number(doc.total);
  const subtotal = Number(doc.subtotal);
  const tax = Number(doc.taxTotal);
  const name = company?.tradingName || company?.legalName || 'Store';
  const auto = sp.autoprint === '1';

  return (
    <div className="pos-receipt-root">
      <div className="pos-receipt-toolbar no-print">
        <Link href="/pos">← Back to POS</Link>
        <button type="button" id="pos-print-btn">
          Print
        </button>
        {auto ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `setTimeout(function(){window.print();},250);document.getElementById('pos-print-btn')?.addEventListener('click',function(){window.print();});`,
            }}
          />
        ) : (
          <script
            dangerouslySetInnerHTML={{
              __html: `document.getElementById('pos-print-btn')?.addEventListener('click',function(){window.print();});`,
            }}
          />
        )}
      </div>

      <article className="pos-receipt-sheet">
        <h1>{name}</h1>
        <p className="center muted">
          {register ? `${register.code} · ${register.name}` : 'POS'}
          <br />
          {doc.documentType === 'sales_return' || doc.posMode === 'return'
            ? 'RETURN / REFUND'
            : doc.invoiceKind === 'tax_invoice'
              ? 'TAX INVOICE'
              : 'SALES RECEIPT'}
        </p>
        <p>
          <strong>{doc.taxInvoiceNumber || doc.documentNumber}</strong>
          <br />
          {doc.issueDate} · {doc.paymentMode || '—'}
          <br />
          Customer: {party?.displayName || party?.name || 'Walk-in'}
        </p>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Amt</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td className="num">{Number(l.quantity)}</td>
                <td className="num">{Number(l.lineTotal).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="totals">
          <div>
            <span>Subtotal</span>
            <span>{subtotal.toFixed(2)}</span>
          </div>
          {tax > 0 ? (
            <div>
              <span>VAT</span>
              <span>{tax.toFixed(2)}</span>
            </div>
          ) : null}
          <div className="grand">
            <span>Total LKR</span>
            <span>{total.toFixed(2)}</span>
          </div>
        </div>
        {doc.amountInWords ? <p className="words">{doc.amountInWords}</p> : null}
        {register?.receiptFooter ? <p className="center footer">{register.receiptFooter}</p> : null}
        <p className="center muted">Thank you</p>
        {register?.printMode === 'thermal' || register?.printMode === 'both' ? (
          <p className="center muted no-print" style={{ fontSize: 11 }}>
            Thermal mode: use browser print to a thermal driver for now (ESC/POS agent in Phase 4).
          </p>
        ) : null}
      </article>

      <style>{`
        .pos-receipt-toolbar { display:flex; gap:16px; padding:12px; font-family:system-ui,sans-serif; }
        .pos-receipt-sheet { width: min(320px, 100%); margin: 0 auto; padding: 12px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; color:#111; }
        .pos-receipt-sheet h1 { text-align:center; font-size: 15px; margin: 0 0 6px; }
        .center { text-align:center; }
        .muted { color:#555; }
        table { width:100%; border-collapse: collapse; margin: 10px 0; }
        th, td { text-align:left; padding: 3px 0; border-bottom: 1px dashed #ccc; }
        .num { text-align:right; white-space:nowrap; }
        .totals { margin-top: 8px; }
        .totals div { display:flex; justify-content:space-between; padding: 2px 0; }
        .totals .grand { font-weight: 800; font-size: 14px; border-top: 1px solid #111; margin-top: 6px; padding-top: 6px; }
        .words { font-size: 11px; margin-top: 8px; }
        .footer { margin-top: 10px; white-space: pre-wrap; }
        @media print {
          .no-print { display:none !important; }
          body { margin:0; }
          .pos-receipt-sheet { width: 72mm; max-width: 72mm; }
        }
      `}</style>
    </div>
  );
}
