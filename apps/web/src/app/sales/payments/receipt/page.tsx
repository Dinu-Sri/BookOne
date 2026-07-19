import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCommercialDocument } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { formatLKR } from '@/components/module/list-page';

export default async function CustomerPaymentReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    account?: string;
    total?: string;
    doc?: string | string[];
    amt?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  const docIds = Array.isArray(sp.doc) ? sp.doc : sp.doc ? [sp.doc] : [];
  const amts = Array.isArray(sp.amt) ? sp.amt : sp.amt ? [sp.amt] : [];
  const rows: { number: string; customer: string; amount: number }[] = [];
  for (let i = 0; i < docIds.length; i++) {
    const detail = await getCommercialDocument(docIds[i]!).catch(() => null);
    if (!detail) continue;
    rows.push({
      number: detail.documentNumber,
      customer: detail.partyName,
      amount: Number(amts[i] ?? 0) || 0,
    });
  }
  const total = Number(sp.total) || rows.reduce((s, r) => s + r.amount, 0);
  const customerName = rows[0]?.customer ?? 'Customer';
  const allSame = rows.every((r) => r.customer === customerName);

  return (
    <div className="tax-invoice-print-root">
      <div className="tax-invoice-toolbar no-print">
        <Link href="/sales/payments">← Receive payments</Link>
        <button type="button" id="receipt-print-btn">
          Print receipt
        </button>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.getElementById('receipt-print-btn')?.addEventListener('click',function(){window.print();});`,
          }}
        />
      </div>

      <article className="tax-invoice-sheet">
        <h1>CUSTOMER PAYMENT RECEIPT</h1>
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <div>
            <strong>Company:</strong> {tenant.name}
          </div>
          <div>
            <strong>Payment date:</strong> {sp.date || '—'}
          </div>
          <div>
            <strong>Deposited to:</strong> {sp.account || '—'}
          </div>
          <div>
            <strong>Received from:</strong> {allSame ? customerName : 'Multiple customers'}
          </div>
        </div>

        <table className="table" style={{ marginTop: 20, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Invoice no.</th>
              <th style={{ textAlign: 'left' }}>Customer</th>
              <th style={{ textAlign: 'right' }}>Amount applied</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.number}-${i}`}>
                <td>{r.number}</td>
                <td>{r.customer}</td>
                <td style={{ textAlign: 'right' }}>{formatLKR(r.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3}>No invoice details (print after a payment).</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div style={{ marginTop: 16, textAlign: 'right', fontWeight: 800, fontSize: 16 }}>
          Total received: {formatLKR(total)}
        </div>
        <p style={{ marginTop: 28, fontSize: 12, color: '#666' }}>
          This receipt confirms payment applied against the invoices listed above (AR reduced).
        </p>
      </article>
    </div>
  );
}
