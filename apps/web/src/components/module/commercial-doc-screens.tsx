import Link from 'next/link';
import {
  createCommercialDocumentFromForm,
  convertDocumentAction,
  type CommercialDocRow,
} from '@/app/actions/commercial-docs';
import { formatLKR, StatusBadge, todayString } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

/** Parties-style list: toolbar + table, no page headings */
export function CommercialDocList({
  newHref,
  newLabel,
  rows,
  emptyTitle,
  searchPlaceholder,
  convertTo,
  convertLabel,
  showTaxCols,
}: {
  newHref: string;
  newLabel: string;
  rows: CommercialDocRow[];
  emptyTitle: string;
  searchPlaceholder?: string;
  convertTo?: 'sales_order' | 'sales_invoice' | 'purchase_order' | 'purchase' | 'vendor_bill';
  convertLabel?: string;
  showTaxCols?: boolean;
}) {
  return (
    <div className="workspace party-workspace">
      <div className="party-toolbar">
        <div className="party-search-form">
          <input
            className="input party-search"
            placeholder={searchPlaceholder ?? 'Search…'}
            aria-label="Search"
            disabled
            title="List filter coming soon — use browser find for now"
          />
        </div>
        <Link href={newHref}>
          <Button variant="primary" type="button">
            {newLabel}
          </Button>
        </Link>
      </div>

      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="empty-state" style={{ padding: 28 }}>
              <h3>{emptyTitle}</h3>
              <p style={{ marginTop: 6 }}>Use {newLabel} to create the first record.</p>
              <div style={{ marginTop: 12 }}>
                <Link href={newHref}>
                  <Button variant="primary" type="button">
                    {newLabel}
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Number</th>
                    {showTaxCols ? <th>Kind</th> : null}
                    <th>Party</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Balance</th>
                    {convertTo ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.taxInvoiceNumber || row.documentNumber}</strong>
                        {row.taxInvoiceNumber ? (
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{row.documentNumber}</div>
                        ) : null}
                      </td>
                      {showTaxCols ? (
                        <td>
                          {row.invoiceKind === 'tax_invoice' ? 'TAX' : 'Commercial'}
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                            {row.saleChannel === 'export' ? 'Export' : 'Local'}
                          </div>
                        </td>
                      ) : null}
                      <td>{row.partyName}</td>
                      <td>{row.issueDate}</td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td>{formatLKR(row.total)}</td>
                      <td>{formatLKR(row.balanceDue)}</td>
                      {convertTo ? (
                        <td>
                          {row.status !== 'converted' &&
                          row.status !== 'void' &&
                          row.status !== 'fully_invoiced' ? (
                            <form action={convertDocumentAction}>
                              <input type="hidden" name="sourceId" value={row.id} />
                              <input type="hidden" name="targetType" value={convertTo} />
                              <Button variant="secondary" type="submit">
                                {convertLabel ?? 'Convert'}
                              </Button>
                            </form>
                          ) : (
                            <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Shared compact form shell used by order / return / POS until dedicated UIs exist */
export function CommercialDocNewForm({
  backHref,
  backLabel,
  documentType,
  partyLabel,
  partyPlaceholder,
  products,
  partyOptions,
  discounts,
  showPaymentAccount,
  paymentAccounts,
  defaultPaymentCode,
  expenseAccounts,
  showExpenseAccount,
  creditWarning,
  submitLabel = 'Save',
}: {
  backHref: string;
  backLabel: string;
  documentType: string;
  partyLabel: string;
  partyPlaceholder: string;
  products: { id: string; name: string; sellPrice: number; unitCost: number }[];
  partyOptions?: {
    id: string;
    name: string;
    code: string | null;
    creditLimit: number | null;
    openBalance: number;
    status: string;
  }[];
  discounts?: { id: string; name: string; discountType: string; value: string | number }[];
  showPaymentAccount?: boolean;
  paymentAccounts?: { code: string; name: string }[];
  defaultPaymentCode?: string;
  expenseAccounts?: { code: string; name: string }[];
  showExpenseAccount?: boolean;
  creditWarning?: boolean;
  submitLabel?: string;
}) {
  const defaultProduct = products[0];
  return (
    <div className="workspace party-workspace">
      <form action={createCommercialDocumentFromForm} className="doc-form-shell">
        <input type="hidden" name="documentType" value={documentType} />
        <input type="hidden" name="lineCount" value="5" />

        <div className="party-form-top">
          <Link href={backHref} className="party-back-btn">
            <span className="party-back-arrow" aria-hidden>
              ←
            </span>
            <span>
              <strong>Back to list</strong>
              <small>{backLabel}</small>
            </span>
          </Link>
        </div>

        <div className="doc-form-scroll">
          <div className="doc-form-header">
            <div className="field field-span-2">
              <label>{partyLabel} *</label>
              {partyOptions && partyOptions.length > 0 ? (
                <select className="input" name="partyName" defaultValue={partyOptions[0]?.name ?? ''} required>
                  {partyOptions.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.code ? `${p.code} — ` : ''}
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="input" name="partyName" placeholder={partyPlaceholder} required />
              )}
            </div>
            <div className="field">
              <label>Or type new name</label>
              <input className="input" name="partyNameOverride" placeholder={partyPlaceholder} />
            </div>
            <div className="field">
              <label>Date *</label>
              <input className="input" name="issueDate" type="date" defaultValue={todayString()} required />
            </div>
            <div className="field">
              <label>Due date</label>
              <input className="input" name="dueDate" type="date" />
            </div>
            {discounts && discounts.length > 0 ? (
              <div className="field">
                <label>Discount</label>
                <select className="input" name="discountId" defaultValue="">
                  <option value="">None</option>
                  {discounts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.discountType === 'percent' ? `${d.value}%` : formatLKR(Number(d.value))})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {showPaymentAccount && paymentAccounts ? (
              <div className="field">
                <label>Payment account</label>
                <select className="input" name="paymentAccountCode" defaultValue={defaultPaymentCode ?? '1000'}>
                  {paymentAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {creditWarning ? (
            <p style={{ fontSize: 12, color: 'var(--warning)', margin: 0 }}>
              Credit limit is advisory. Review open AR before posting large invoices.
            </p>
          ) : null}

          <div className="doc-lines-card">
            <div className="doc-lines-head">
              <span>Line items</span>
            </div>
            <div className="doc-lines-scroll">
              <table className="doc-lines-table">
                <thead>
                  <tr>
                    <th className="col-item">Product</th>
                    <th>Description</th>
                    <th className="col-qty">Qty</th>
                    <th className="col-price">Unit price</th>
                    {showExpenseAccount ? <th>Account</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <tr key={i}>
                      <td>
                        <select
                          className="input"
                          name={`line_${i}_productId`}
                          defaultValue={i === 0 && defaultProduct ? defaultProduct.id : ''}
                        >
                          <option value="">Free text</option>
                          {products.map((p) => (
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
                          placeholder={i === 0 ? 'Required if no product' : 'Optional'}
                          defaultValue={i === 0 && defaultProduct ? defaultProduct.name : ''}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          name={`line_${i}_quantity`}
                          defaultValue={i === 0 ? '1' : ''}
                          inputMode="decimal"
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          name={`line_${i}_unitPrice`}
                          defaultValue={i === 0 && defaultProduct ? String(defaultProduct.sellPrice) : ''}
                          inputMode="decimal"
                        />
                      </td>
                      {showExpenseAccount && expenseAccounts ? (
                        <td>
                          <select className="input" name={`line_${i}_accountCode`} defaultValue="6800">
                            {expenseAccounts.map((a) => (
                              <option key={a.code} value={a.code}>
                                {a.code}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)' }}>Notes</label>
            <input className="input" name="notes" placeholder="Optional notes" />
          </div>
        </div>

        <div className="doc-form-footer">
          <Link href={backHref}>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </Link>
          <Button variant="primary" type="submit">
            {submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
