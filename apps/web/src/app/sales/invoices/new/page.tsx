import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createCommercialDocumentFromForm, listCommercialDocuments } from '@/app/actions/commercial-docs';
import { getSalesSettings } from '@/app/actions/sales-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { loadSalesFormData } from '@/lib/module-page-helpers';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { todayString } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';

export default async function NewSalesInvoicePage() {
  let tenant;
  let form;
  let settings;
  let openOrders;
  try {
    [tenant, form, settings, openOrders] = await Promise.all([
      getTenantInfo(),
      loadSalesFormData('customer'),
      getSalesSettings(),
      listCommercialDocuments(['sales_order']),
    ]);
  } catch {
    redirect('/login');
  }

  const orders = openOrders.filter((o) => o.status !== 'fully_invoiced' && o.status !== 'converted');
  const defaultProduct = form.products[0];

  return (
    <BookOneShell active="Sales Invoices" tenant={tenant}>
      <div className="workspace party-workspace">
        <form action={createCommercialDocumentFromForm} className="doc-form-shell">
          <input type="hidden" name="documentType" value="sales_invoice" />
          <input type="hidden" name="lineCount" value="5" />

          <div className="party-form-top">
            <Link href="/sales/invoices" className="party-back-btn">
              <span className="party-back-arrow">←</span>
              <span>
                <strong>Back to list</strong>
                <small>Sales invoices</small>
              </span>
            </Link>
          </div>

          <div className="doc-form-scroll">
            <div className="doc-form-header">
              <div className="field">
                <label>Sale channel</label>
                <select className="input" name="saleChannel" defaultValue={settings.defaultSaleChannel}>
                  <option value="local">Local sales</option>
                  <option value="export">Export sales</option>
                </select>
              </div>
              <div className="field">
                <label>Invoice kind</label>
                <select
                  className="input"
                  name="invoiceKind"
                  defaultValue={settings.vatRegistered ? settings.defaultInvoiceKind : 'commercial'}
                >
                  <option value="commercial">Commercial invoice</option>
                  <option value="tax_invoice" disabled={!settings.vatRegistered}>
                    TAX INVOICE
                    {settings.vatRegistered ? ` (VAT ${settings.vatRatePercent}%)` : ' (enable in Sales Settings)'}
                  </option>
                </select>
              </div>
              <div className="field field-span-2">
                <label>Customer *</label>
                {form.partyOptions.length > 0 ? (
                  <select className="input" name="partyName" defaultValue={form.partyOptions[0]?.name ?? ''} required>
                    {form.partyOptions.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.code ? `${p.code} — ` : ''}
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className="input" name="partyName" required placeholder="Customer name" />
                )}
              </div>
              <div className="field">
                <label>Or type name</label>
                <input className="input" name="partyNameOverride" placeholder="Walk-in / new" />
              </div>
              <div className="field">
                <label>Invoice date *</label>
                <input className="input" name="issueDate" type="date" defaultValue={todayString()} required />
              </div>
              <div className="field">
                <label>Date of delivery</label>
                <input className="input" name="deliveryDate" type="date" defaultValue={todayString()} />
              </div>
              <div className="field">
                <label>Due date</label>
                <input className="input" name="dueDate" type="date" />
              </div>
              <div className="field">
                <label>Mode of payment</label>
                <select className="input" name="paymentMode" defaultValue="Credit">
                  <option value="Credit">Credit</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank</option>
                  <option value="Card">Card</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="field field-span-2">
                <label>Place of supply</label>
                <input className="input" name="placeOfSupply" placeholder="e.g. Colombo" />
              </div>
              <div className="field">
                <label>Purchaser TIN</label>
                <input className="input" name="purchaserTin" placeholder="Tax invoice" />
              </div>
              <div className="field">
                <label>Purchaser phone</label>
                <input className="input" name="purchaserPhone" />
              </div>
              <div className="field field-span-2">
                <label>Purchaser address</label>
                <input className="input" name="purchaserAddress" />
              </div>
              <div className="field">
                <label>Export country</label>
                <input className="input" name="exportCountry" placeholder="If export" />
              </div>
              <div className="field">
                <label>Export ref / permit</label>
                <input className="input" name="exportRef" />
              </div>
            </div>

            {orders.length > 0 ? (
              <div className="doc-lines-card" style={{ minHeight: 0, maxHeight: 160 }}>
                <div className="doc-lines-head">
                  <span>Link sales orders (optional multi-select)</span>
                </div>
                <div className="doc-lines-scroll">
                  <table className="doc-lines-table">
                    <thead>
                      <tr>
                        <th />
                        <th>Number</th>
                        <th>Customer</th>
                        <th>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id}>
                          <td>
                            <input type="checkbox" name="sourceOrderIds" value={o.id} />
                          </td>
                          <td>
                            <strong>{o.documentNumber}</strong>
                          </td>
                          <td>{o.partyName}</td>
                          <td>LKR {o.total.toLocaleString()}</td>
                          <td>{o.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="doc-lines-card">
              <div className="doc-lines-head">
                <span>Line items (unit price excluding VAT)</span>
              </div>
              <div className="doc-lines-scroll">
                <table className="doc-lines-table">
                  <thead>
                    <tr>
                      <th className="col-item">Product</th>
                      <th>Description</th>
                      <th className="col-qty">Qty</th>
                      <th className="col-price">Unit price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <tr key={i}>
                        <td>
                          <select
                            className="input"
                            name={`line_${i}_productId`}
                            defaultValue={i === 0 ? defaultProduct?.id ?? '' : ''}
                          >
                            <option value="">Free text</option>
                            {form.products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="input"
                            name={`line_${i}_description`}
                            defaultValue={i === 0 ? defaultProduct?.name ?? '' : ''}
                            placeholder={i === 0 ? 'Required if no product' : 'Optional'}
                          />
                        </td>
                        <td>
                          <input className="input" name={`line_${i}_quantity`} defaultValue={i === 0 ? '1' : ''} />
                        </td>
                        <td>
                          <input
                            className="input"
                            name={`line_${i}_unitPrice`}
                            defaultValue={i === 0 && defaultProduct ? String(defaultProduct.sellPrice) : ''}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="doc-form-bottom">
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)' }}>
                  Additional information
                </label>
                <input className="input" name="additionalInfo" />
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', marginTop: 8 }}>
                  Notes
                </label>
                <input className="input" name="notes" />
              </div>
            </div>
          </div>

          <div className="doc-form-footer">
            <Link href="/sales/invoices">
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </Link>
            <Button variant="primary" type="submit">
              Save invoice
            </Button>
          </div>
        </form>
      </div>
    </BookOneShell>
  );
}
