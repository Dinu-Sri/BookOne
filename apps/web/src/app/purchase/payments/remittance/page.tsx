import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadPaymentPrintFacts } from '@/app/actions/documents';
import { getTenantInfo } from '@/app/actions/workspace';
import { formatLKR } from '@/components/module/list-page';

export default async function VendorRemittancePage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string | string[] }>;
}) {
  const sp = await searchParams;
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  const paymentIds = Array.isArray(sp.payment) ? sp.payment : sp.payment ? [sp.payment] : [];
  const facts = await loadPaymentPrintFacts(paymentIds).catch(() => null);
  const rows = (facts?.rows ?? []).map((r) => ({
    number: r.number,
    vendor: r.partyName,
    amount: r.amount,
  }));
  const total = facts?.total ?? 0;
  const vendorName = facts?.partyName ?? 'Vendor';
  const allSameVendor = rows.length > 0 && rows.every((r) => r.vendor === vendorName);

  return (
    <div className="tax-invoice-print-root">
      <div className="tax-invoice-toolbar no-print">
        <Link href="/purchase/payments">← Pay vendors</Link>
        <button type="button" id="remittance-print-btn">
          Print remittance
        </button>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.getElementById('remittance-print-btn')?.addEventListener('click',function(){window.print();});`,
          }}
        />
      </div>

      <article className="tax-invoice-sheet">
        <h1>VENDOR PAYMENT REMITTANCE</h1>
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <div>
            <strong>Company:</strong> {tenant.name}
          </div>
          <div>
            <strong>Payment date:</strong> {facts?.date || '—'}
          </div>
          <div>
            <strong>Paid from account:</strong> {facts?.account || '—'}
          </div>
          <div>
            <strong>Payee:</strong> {allSameVendor ? vendorName : 'Multiple vendors'}
          </div>
        </div>

        <table className="table" style={{ marginTop: 20, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Bill no.</th>
              <th style={{ textAlign: 'left' }}>Vendor</th>
              <th style={{ textAlign: 'right' }}>Amount paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.number}-${i}`}>
                <td>{r.number}</td>
                <td>{r.vendor}</td>
                <td style={{ textAlign: 'right' }}>{formatLKR(r.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3}>No bill details (print after a payment).</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div style={{ marginTop: 16, textAlign: 'right', fontWeight: 800, fontSize: 16 }}>
          Total paid: {formatLKR(total)}
        </div>
        <p style={{ marginTop: 28, fontSize: 12, color: '#666' }}>
          This remittance advice confirms payment allocation against the bills listed above.
        </p>
      </article>
    </div>
  );
}
