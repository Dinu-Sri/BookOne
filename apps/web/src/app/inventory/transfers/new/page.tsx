import { redirect } from 'next/navigation';
import { createStockDocFromForm, listProducts } from '@/app/actions/inventory';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { FormPageShell, todayString } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';

export default async function NewTransferPage() {
  let tenant;
  let products;
  try {
    [tenant, products] = await Promise.all([getTenantInfo(), listProducts()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Stock Transfers" tenant={tenant}>
      <FormPageShell
        eyebrow="Inventory"
        title="New stock transfer"
        lead="Moves quantity only — no profit & loss impact."
        backHref="/inventory/transfers"
      >
        <form action={createStockDocFromForm} className="form-grid">
          <input type="hidden" name="docType" value="transfer" />
          <input type="hidden" name="lineCount" value="3" />
          <div className="field">
            <label>Date</label>
            <input className="input" name="docDate" type="date" defaultValue={todayString()} required />
          </div>
          <div className="field">
            <label>Reason</label>
            <input className="input" name="reason" placeholder="Branch restock" />
          </div>
          <div className="field field-full">
            <label>Lines (qty moved from default location to target bucket)</label>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2].map((i) => (
                    <tr key={i}>
                      <td>
                        <select className="input" name={`line_${i}_productId`} defaultValue={i === 0 ? products[0]?.id ?? '' : ''}>
                          <option value="">Select product</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
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
          <div className="field field-full">
            <Button variant="primary" type="submit">Post transfer</Button>
          </div>
        </form>
      </FormPageShell>
    </BookOneShell>
  );
}
