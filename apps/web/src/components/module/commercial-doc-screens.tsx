import Link from 'next/link';
import {
  createCommercialDocumentFromForm,
  convertDocumentAction,
  type CommercialDocRow,
} from '@/app/actions/commercial-docs';
import { formatLKR, FormPageShell, ModulePageHeader, StatusBadge, todayString } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

export function CommercialDocList({
  eyebrow,
  title,
  lead,
  newHref,
  newLabel,
  rows,
  emptyTitle,
  convertTo,
  convertLabel,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  newHref: string;
  newLabel: string;
  rows: CommercialDocRow[];
  emptyTitle: string;
  convertTo?: 'sales_order' | 'sales_invoice' | 'purchase_order' | 'purchase' | 'vendor_bill';
  convertLabel?: string;
}) {
  return (
    <div className="workspace">
      <ModulePageHeader eyebrow={eyebrow} title={title} lead={lead} newHref={newHref} newLabel={newLabel} />
      <Card>
        <div className="card-body" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              <h3>{emptyTitle}</h3>
              <p>Use {newLabel} to create the first record.</p>
              <div style={{ marginTop: 12 }}>
                <Link href={newHref}>
                  <Button variant="primary" type="button">{newLabel}</Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Number</th>
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
                      <td><strong>{row.documentNumber}</strong></td>
                      <td>{row.partyName}</td>
                      <td>{row.issueDate}</td>
                      <td><StatusBadge status={row.status} /></td>
                      <td>{formatLKR(row.total)}</td>
                      <td>{formatLKR(row.balanceDue)}</td>
                      {convertTo ? (
                        <td>
                          {row.status !== 'converted' && row.status !== 'void' ? (
                            <form action={convertDocumentAction}>
                              <input type="hidden" name="sourceId" value={row.id} />
                              <input type="hidden" name="targetType" value={convertTo} />
                              <Button variant="secondary" type="submit">{convertLabel ?? 'Convert'}</Button>
                            </form>
                          ) : (
                            <span style={{ color: 'var(--ink-soft)' }}>—</span>
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

export function CommercialDocNewForm({
  eyebrow,
  title,
  lead,
  backHref,
  documentType,
  partyLabel,
  partyPlaceholder,
  products,
  discounts,
  showPaymentAccount,
  paymentAccounts,
  defaultPaymentCode,
  expenseAccounts,
  showExpenseAccount,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  backHref: string;
  documentType: string;
  partyLabel: string;
  partyPlaceholder: string;
  products: { id: string; name: string; sellPrice: number; unitCost: number }[];
  discounts?: { id: string; name: string; discountType: string; value: string | number }[];
  showPaymentAccount?: boolean;
  paymentAccounts?: { code: string; name: string }[];
  defaultPaymentCode?: string;
  expenseAccounts?: { code: string; name: string }[];
  showExpenseAccount?: boolean;
}) {
  const defaultProduct = products[0];
  return (
    <FormPageShell eyebrow={eyebrow} title={title} lead={lead} backHref={backHref}>
      <form action={createCommercialDocumentFromForm} className="form-grid">
        <input type="hidden" name="documentType" value={documentType} />
        <input type="hidden" name="lineCount" value="3" />

        <div className="field">
          <label>{partyLabel}</label>
          <input className="input" name="partyName" placeholder={partyPlaceholder} required />
        </div>
        <div className="field">
          <label>Date</label>
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
                <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="field field-full">
          <label>Line items</label>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  {showExpenseAccount ? <th>Account</th> : null}
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2].map((i) => (
                  <tr key={i}>
                    <td>
                      <select className="input" name={`line_${i}_productId`} defaultValue={i === 0 && defaultProduct ? defaultProduct.id : ''}>
                        <option value="">Free text</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input"
                        name={`line_${i}_description`}
                        placeholder={i === 0 ? 'Required if no product' : 'Optional line'}
                        defaultValue={i === 0 && defaultProduct ? defaultProduct.name : ''}
                        required={i === 0 && !defaultProduct}
                      />
                    </td>
                    <td>
                      <input className="input" name={`line_${i}_quantity`} defaultValue={i === 0 ? '1' : ''} inputMode="decimal" />
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
                            <option key={a.code} value={a.code}>{a.code}</option>
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

        <div className="field field-full">
          <label>Notes</label>
          <input className="input" name="notes" placeholder="Optional notes" />
        </div>
        <div className="field field-full">
          <Button variant="primary" type="submit">Save</Button>
        </div>
      </form>
    </FormPageShell>
  );
}
