import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCommercialDocument } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';
import { formatLKR } from '@/components/module/list-page';

export default async function VendorRemittancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; account?: string; total?: string; doc?: string | string[]; amt?: string | string[] }>;
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
  const rows: { number: string; vendor: string; amount: number }[] = [];
  for (let i = 0; i < docIds.length; i++) {
    const detail = await getCommercialDocument(docIds[i]!).catch(() => null);
    if (!detail) continue;
    rows.push({
      number: detail.documentNumber,
      vendor: detail.partyName,
      amount: Number(amts[i] ?? detail.balanceDue) || 0,
    });
  }
  const total = Number(sp.total) || rows.reduce((s, r) => s + r.amount, 0);
  const vendorName = rows[0]?.vendor ?? 'Vendor';
  const allSameVendor = rows.every((r) => r.vendor === vendorName);

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
            <strong>Payment date:</strong> {sp.date || '—'}
          </div>
          <div>
            <strong>Paid from account:</strong> {sp.account || '—'}
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
