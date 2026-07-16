import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createStockDocFromForm, listPhysicalProductOptions } from '@/app/actions/inventory';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { todayString } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';

export default async function NewAdjustmentPage() {
  let tenant;
  let products;
  try {
    [tenant, products] = await Promise.all([getTenantInfo(), listPhysicalProductOptions()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Stock Adjustments" tenant={tenant}>
      <div className="workspace party-workspace">
        <div className="party-form-shell">
          <div className="party-form-top">
            <Link href="/inventory/adjustments" className="party-back-btn">
              <span className="party-back-arrow">←</span>
              <span>
                <strong>Back to list</strong>
                <small>Adjustments</small>
              </span>
            </Link>
          </div>
          <form action={createStockDocFromForm} className="party-form-body">
            <input type="hidden" name="docType" value="adjustment" />
            <input type="hidden" name="lineCount" value="3" />
            <div className="party-tab-grid">
              <div className="field">
                <label>Date</label>
                <input className="input" name="docDate" type="date" defaultValue={todayString()} required />
              </div>
              <div className="field">
                <label>Reason *</label>
                <input className="input" name="reason" placeholder="Stock count / damage" required />
              </div>
              <div className="field field-full">
                <label>Physical product lines (use negative qty to decrease)</label>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty delta</th>
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
                            <input
                              className="input"
                              name={`line_${i}_quantity`}
                              inputMode="decimal"
                              placeholder="-1 or 2"
                              defaultValue={i === 0 ? '-1' : ''}
                            />
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
              <Link href="/inventory/adjustments">
                <Button variant="secondary" type="button">
                  Cancel
                </Button>
              </Link>
              <Button variant="primary" type="submit">
                Post adjustment
              </Button>
            </div>
          </form>
        </div>
      </div>
    </BookOneShell>
  );
}
