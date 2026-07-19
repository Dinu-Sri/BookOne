'use client';

/**
 * Legacy thin list shell kept for rare callers.
 * Prefer CommercialDocumentList for full search/sort/actions UX.
 * CommercialDocNewForm uses DocumentLinesEditor (product search + free-text + save-as).
 */

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import {
  createCommercialDocumentFromForm,
  convertDocumentAction,
  type CommercialDocRow,
} from '@/app/actions/commercial-docs';
import {
  DocumentLinesEditor,
  computeLineAmounts,
  type DocLineState,
} from '@/components/module/document-lines-editor';
import type { ProductPick } from '@/components/module/product-add-search';
import { formatLKR, StatusBadge, todayString } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

/** Parties-style list: toolbar + table (basic — prefer CommercialDocumentList) */
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
            title="Use CommercialDocumentList for live search"
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

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Shared create form — product search, free-text, save-as-product (purchase + sales). */
export function CommercialDocNewForm({
  backHref,
  backLabel,
  documentType,
  partyLabel,
  partyPlaceholder,
  products: initialProducts,
  partyOptions,
  discounts,
  showPaymentAccount,
  paymentAccounts,
  defaultPaymentCode,
  expenseAccounts,
  showExpenseAccount,
  showPurchaseExtras,
  showLandedCost,
  showPurchaseVat,
  vatRegistered,
  vatRatePercent,
  creditWarning,
  banner,
  submitLabel = 'Save',
  sourceDocumentId,
  initialLines,
  defaultPaymentTerms,
  defaultExpenseAccount,
}: {
  backHref: string;
  backLabel: string;
  documentType: string;
  partyLabel: string;
  partyPlaceholder: string;
  products: ProductPick[];
  partyOptions?: {
    id: string;
    name: string;
    code: string | null;
    creditLimit?: number | null;
    openBalance?: number;
    status?: string;
  }[];
  discounts?: { id: string; name: string; discountType: string; value: string | number }[];
  showPaymentAccount?: boolean;
  paymentAccounts?: { code: string; name: string }[];
  defaultPaymentCode?: string;
  expenseAccounts?: { code: string; name: string }[];
  showExpenseAccount?: boolean;
  /** Supplier inv #, terms, delivery date */
  showPurchaseExtras?: boolean;
  /** Freight / duty / other (import) */
  showLandedCost?: boolean;
  /** Input VAT toggle when company VAT-registered */
  showPurchaseVat?: boolean;
  vatRegistered?: boolean;
  vatRatePercent?: number;
  creditWarning?: boolean;
  banner?: string;
  submitLabel?: string;
  sourceDocumentId?: string | null;
  initialLines?: DocLineState[];
  defaultPaymentTerms?: string;
  defaultExpenseAccount?: string;
}) {
  const [lines, setLines] = useState<DocLineState[]>(initialLines ?? []);
  const [catalog, setCatalog] = useState<ProductPick[]>(initialProducts);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [pinDetailsExpanded, setPinDetailsExpanded] = useState(false);
  const preferredExpense =
    defaultExpenseAccount ||
    expenseAccounts?.find((a) => a.code === '6800')?.code ||
    expenseAccounts?.[0]?.code ||
    '6800';
  const [expenseCode, setExpenseCode] = useState(preferredExpense);
  const [headerDiscount, setHeaderDiscount] = useState('0');
  const [discountId, setDiscountId] = useState('');

  const handleSearchActive = useCallback(
    (active: boolean) => {
      if (active) {
        if (!pinDetailsExpanded) setDetailsCollapsed(true);
      } else {
        setDetailsCollapsed(false);
        setPinDetailsExpanded(false);
      }
    },
    [pinDetailsExpanded],
  );

  const computed = useMemo(() => {
    const lineAmounts = computeLineAmounts(lines);
    const subtotal = Math.round(lineAmounts.reduce((s, a) => s + a, 0) * 100) / 100;
    let discountAmt = Number(String(headerDiscount).replace(/[^0-9.-]/g, '')) || 0;
    if (discountId && discounts) {
      const d = discounts.find((x) => x.id === discountId);
      if (d) {
        discountAmt =
          d.discountType === 'percent'
            ? Math.round(((subtotal * Number(d.value)) / 100) * 100) / 100
            : Number(d.value);
      }
    }
    discountAmt = Math.min(Math.max(0, discountAmt), subtotal);
    return { subtotal, discountAmt, total: Math.round((subtotal - discountAmt) * 100) / 100 };
  }, [lines, headerDiscount, discountId, discounts]);

  return (
    <div className="workspace party-workspace">
      <form action={createCommercialDocumentFromForm} className="doc-form-shell">
        <input type="hidden" name="documentType" value={documentType} />
        <input type="hidden" name="lineCount" value={String(Math.max(lines.length, 1))} />
        <input type="hidden" name="headerDiscount" value={String(computed.discountAmt)} />
        {sourceDocumentId ? (
          <input type="hidden" name="sourceDocumentId" value={sourceDocumentId} />
        ) : null}

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
          {banner ? (
            <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
              {banner}
            </div>
          ) : null}
        </div>

        <div className="doc-form-scroll">
          {detailsCollapsed ? (
            <button
              type="button"
              className="doc-details-collapsed-bar"
              onClick={() => {
                setDetailsCollapsed(false);
                setPinDetailsExpanded(true);
              }}
            >
              <span>
                <strong>Document details</strong>
                <small>Click to expand</small>
              </span>
              <span className="doc-details-collapsed-hint">Expand</span>
            </button>
          ) : null}

          <div className={`doc-form-header ${detailsCollapsed ? 'is-collapsed' : ''}`}>
            <div className="field field-span-2">
              <label>{partyLabel} *</label>
              {partyOptions && partyOptions.length > 0 ? (
                <select
                  className="input"
                  name="partyName"
                  defaultValue={partyOptions[0]?.name ?? ''}
                  required
                >
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
            {showPurchaseExtras ? (
              <>
                <div className="field">
                  <label>Delivery date</label>
                  <input className="input" name="deliveryDate" type="date" />
                </div>
                <div className="field">
                  <label>Supplier invoice #</label>
                  <input
                    className="input"
                    name="supplierInvoiceNumber"
                    placeholder="Vendor bill / invoice no."
                    maxLength={80}
                  />
                </div>
                <div className="field">
                  <label>Payment terms</label>
                  <select
                    className="input"
                    name="paymentMode"
                    defaultValue={defaultPaymentTerms || 'Net 30'}
                  >
                    <option value="">—</option>
                    <option value="Due on receipt">Due on receipt</option>
                    <option value="Net 7">Net 7</option>
                    <option value="Net 15">Net 15</option>
                    <option value="Net 30">Net 30</option>
                    <option value="Net 45">Net 45</option>
                    <option value="Net 60">Net 60</option>
                  </select>
                </div>
              </>
            ) : null}
            {showPurchaseVat && vatRegistered ? (
              <div className="field">
                <label>VAT</label>
                <select className="input" name="invoiceKind" defaultValue="commercial">
                  <option value="commercial">No input VAT</option>
                  <option value="tax_invoice">
                    Claim input VAT ({vatRatePercent ?? 18}%)
                  </option>
                </select>
              </div>
            ) : null}
            {showLandedCost ? (
              <>
                <div className="field">
                  <label>Freight / shipping</label>
                  <input className="input" name="freightAmount" inputMode="decimal" placeholder="0" />
                </div>
                <div className="field">
                  <label>Customs duty</label>
                  <input className="input" name="dutyAmount" inputMode="decimal" placeholder="0" />
                </div>
                <div className="field">
                  <label>Other charges</label>
                  <input className="input" name="otherCharges" inputMode="decimal" placeholder="0" />
                </div>
              </>
            ) : null}
            {discounts && discounts.length > 0 ? (
              <div className="field">
                <label>Discount</label>
                <select
                  className="input"
                  name="discountId"
                  value={discountId}
                  onChange={(e) => setDiscountId(e.target.value)}
                >
                  <option value="">None</option>
                  {discounts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} (
                      {d.discountType === 'percent' ? `${d.value}%` : formatLKR(Number(d.value))})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="field">
                <label>Header discount (LKR)</label>
                <input
                  className="input"
                  inputMode="decimal"
                  value={headerDiscount}
                  onChange={(e) => setHeaderDiscount(e.target.value)}
                  placeholder="0"
                />
              </div>
            )}
            {showPaymentAccount && paymentAccounts ? (
              <div className="field">
                <label>Payment account</label>
                <select
                  className="input"
                  name="paymentAccountCode"
                  defaultValue={defaultPaymentCode ?? '1000'}
                >
                  {paymentAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {showExpenseAccount && expenseAccounts && expenseAccounts.length > 0 ? (
              <div className="field">
                <label>Expense account</label>
                <select
                  className="input"
                  value={expenseCode}
                  onChange={(e) => setExpenseCode(e.target.value)}
                >
                  {expenseAccounts.map((a) => (
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

          <DocumentLinesEditor
            products={catalog}
            lines={lines}
            onChange={setLines}
            onSearchActive={handleSearchActive}
            onCatalogProduct={(p) =>
              setCatalog((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]))
            }
            hint="Search catalog · free text · Save as product (service default)"
          />

          {/* Apply expense account to each line for purchase GL */}
          {showExpenseAccount
            ? lines.map((_, i) => (
                <input
                  key={`exp-${i}`}
                  type="hidden"
                  name={`line_${i}_accountCode`}
                  value={expenseCode}
                />
              ))
            : null}

          <div className="doc-form-bottom">
            <div className="field doc-notes" style={{ margin: 0 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)' }}>Notes</label>
              <input className="input" name="notes" placeholder="Optional notes" />
            </div>
            <div className="doc-totals" aria-live="polite">
              <div className="doc-totals-row">
                <span>Subtotal</span>
                <strong>LKR {money(computed.subtotal)}</strong>
              </div>
              <div className="doc-totals-row">
                <span>Discount</span>
                <strong>LKR {money(computed.discountAmt)}</strong>
              </div>
              <div className="doc-totals-row is-total">
                <span>Total</span>
                <strong>LKR {money(computed.total)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="doc-form-footer">
          <Link href={backHref}>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </Link>
          <Button variant="primary" type="submit" disabled={lines.length === 0}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
