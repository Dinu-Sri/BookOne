import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listRentalJobs } from '@/app/actions/rental-bookings';
import { getTenantInfo } from '@/app/actions/workspace';

export default async function PackingListPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listRentalJobs({ documentId })]);
  } catch {
    redirect('/login');
  }
  if (rows.length === 0) redirect('/inventory/on-rent');

  const job = rows[0]!;
  const totalPieces = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="workspace" style={{ maxWidth: 720, margin: '24px auto', fontFamily: 'Georgia, serif' }}>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <div className="no-print" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Link href="/inventory/on-rent">← Dispatch / returns</Link>
        <button type="button" id="packing-print-btn">
          Print
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>
        {tenant.name} · packing list
      </p>
      <h1 style={{ margin: '6px 0 12px', fontSize: 26 }}>Dispatch packing list</h1>
      <p style={{ margin: '0 0 16px' }}>
        <strong>{job.documentNumber}</strong> · {job.partyName}
        {job.venue ? ` · ${job.venue}` : ''}
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>When</th>
            <th>Item</th>
            <th>Qty</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {r.hireFrom} → {r.hireTo}
              </td>
              <td>
                <strong>{r.productName}</strong>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{r.sku}</div>
              </td>
              <td>{r.qty}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 16 }}>
        Total pieces <strong>{totalPieces}</strong>. Tick each line when packed. Return with this sheet.
      </p>
      <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
        Packed by _____________ · Loaded by _____________ · Date _____________
      </p>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById('packing-print-btn')?.addEventListener('click',function(){window.print()});`,
        }}
      />
    </div>
  );
}
