import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createStockDocFromForm, listPhysicalProductOptions } from '@/app/actions/inventory';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { todayString } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';

export default async function NewTransferPage() {
  let tenant;
  let products;
  try {
    [tenant, products] = await Promise.all([getTenantInfo(), listPhysicalProductOptions()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Stock Transfers" tenant={tenant}>
      <div className="workspace party-workspace">
        <div className="party-form-shell">
          <div className="party-form-top">
            <Link href="/inventory/transfers" className="party-back-btn">
              <span className="party-back-arrow">←</span>
              <span>
                <strong>Back to list</strong>
                <small>Transfers</small>
              </span>
            </Link>
          </div>
          <form action={createStockDocFromForm} className="party-form-body">
            <input type="hidden" name="docType" value="transfer" />
            <input type="hidden" name="lineCount" value="3" />
            <div className="party-tab-grid">
              <div className="field">
                <label>Date</label>
                <input className="input" name="docDate" type="date" defaultValue={todayString()} required />
              </div>
              <div className="field">
                <label>Reason</label>
                <input className="input" name="reason" placeholder="Branch restock" />
              </div>
              <div className="field field-full">
                <label>Physical product lines only</label>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[0, 1, 2].map((i) => (
                        <tr key={i}>
                          <td>
                            <select className="input" name={`line_${i}_productId`} defaultValue={i === 0 ? products[0]?.id ?? '' : ''}>
                              <option value="">Select product</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.sku} — {p.name} (qty {p.qtyOnHand})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input className="input" name={`line_${i}_quantity`} inputMode="decimal" defaultValue={i === 0 ? '1' : ''} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="field field-full">
                <label>Notes</label>
                <input className="input" name="notes" />
              </div>
            </div>
            <div className="party-form-footer">
              <Link href="/inventory/transfers">
                <Button variant="secondary" type="button">
                  Cancel
                </Button>
              </Link>
              <Button variant="primary" type="submit">
                Post transfer
              </Button>
            </div>
          </form>
        </div>
      </div>
    </BookOneShell>
  );
}
