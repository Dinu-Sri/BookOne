'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { createCommercialDocumentFromForm } from '@/app/actions/commercial-docs';
import { formatLKR, todayString } from '@/components/module/list-page';
import { ProductAddSearch, type ProductPick } from '@/components/module/product-add-search';
import { Button } from '@/components/ui/bookone-ui';

type ProductOpt = ProductPick;
type PartyOpt = {
  id: string;
  name: string;
  code: string | null;
  creditLimit: number | null;
  openBalance: number;
  status: string;
};
type DiscountOpt = { id: string; name: string; discountType: string; value: string | number };

type LineState = {
  key: string;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  sku?: string;
};

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function newKey() {
  return `L-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function QuotationForm({
  products,
  partyOptions,
  discounts,
  backHref = '/sales/quotations',
}: {
  products: ProductOpt[];
  partyOptions: PartyOpt[];
  discounts: DiscountOpt[];
  backHref?: string;
}) {
  const today = todayString();
  const [issueDate, setIssueDate] = useState(today);
  const [goodThru, setGoodThru] = useState(addDaysIso(today, 30));
  const [headerDiscount, setHeaderDiscount] = useState('0');
  const [discountId, setDiscountId] = useState('');
  /** Committed lines only — add via search UX */
  const [lines, setLines] = useState<LineState[]>([]);

  const computed = useMemo(() => {
    let subtotal = 0;
    const lineAmounts = lines.map((line) => {
      const qty = Number(String(line.quantity).replace(/[^0-9.-]/g, '')) || 0;
      const price = Number(String(line.unitPrice).replace(/[^0-9.-]/g, '')) || 0;
      const amount = Math.round(qty * price * 100) / 100;
      subtotal = Math.round((subtotal + amount) * 100) / 100;
      return amount;
    });

    let discountAmt = Number(String(headerDiscount).replace(/[^0-9.-]/g, '')) || 0;
    if (discountId) {
      const d = discounts.find((x) => x.id === discountId);
      if (d) {
        discountAmt =
          d.discountType === 'percent'
            ? Math.round(((subtotal * Number(d.value)) / 100) * 100) / 100
            : Number(d.value);
      }
    }
    discountAmt = Math.min(Math.max(0, discountAmt), subtotal);
    const total = Math.round((subtotal - discountAmt) * 100) / 100;
    return { subtotal, discountAmt, total, lineAmounts };
  }, [lines, headerDiscount, discountId, discounts]);

  function pickProduct(p: ProductPick) {
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        productId: p.id,
        description: p.name,
        quantity: '1',
        unitPrice: String(p.sellPrice),
        sku: p.sku,
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  return (
    <form action={createCommercialDocumentFromForm} className="doc-form-shell">
      <input type="hidden" name="documentType" value="quotation" />
      <input type="hidden" name="lineCount" value={String(Math.max(lines.length, 1))} />
      <input type="hidden" name="headerDiscount" value={String(computed.discountAmt)} />

      <div className="party-form-top">
        <Link href={backHref} className="party-back-btn">
          <span className="party-back-arrow" aria-hidden>
            ←
          </span>
          <span>
            <strong>Back to list</strong>
            <small>Quotations</small>
          </span>
        </Link>
        <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
          Quote · no GL until invoice
        </div>
      </div>

      <div className="doc-form-scroll">
        <div className="doc-form-header">
          <div className="field field-span-2">
            <label>Customer *</label>
            {partyOptions.length > 0 ? (
              <select className="input" name="partyName" defaultValue={partyOptions[0]?.name ?? ''} required>
                {partyOptions.map((p) => (
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
            <label>Or type new name</label>
            <input className="input" name="partyNameOverride" placeholder="Walk-in / new" />
          </div>
          <div className="field">
            <label>Quote date *</label>
            <input
              className="input"
              name="issueDate"
              type="date"
              required
              value={issueDate}
              onChange={(e) => {
                setIssueDate(e.target.value);
                setGoodThru(addDaysIso(e.target.value, 30));
              }}
            />
          </div>
          <div className="field">
            <label>Good thru</label>
            <input
              className="input"
              name="dueDate"
              type="date"
              value={goodThru}
              onChange={(e) => setGoodThru(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Customer P.O.</label>
            <input className="input" name="exportRef" placeholder="Optional PO / ref" />
          </div>
          <div className="field">
            <label>Ship via</label>
            <select className="input" name="paymentMode" defaultValue="">
              <option value="">—</option>
              <option value="Pickup">Customer pickup</option>
              <option value="Courier">Courier</option>
              <option value="Own delivery">Own delivery</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="field">
            <label>Terms</label>
            <select className="input" name="placeOfSupply" defaultValue="Net 30">
              <option value="Net 30">Net 30</option>
              <option value="Net 15">Net 15</option>
              <option value="Due on receipt">Due on receipt</option>
              <option value="COD">COD</option>
            </select>
          </div>
          {discounts.length > 0 ? (
            <div className="field">
              <label>Discount scheme</label>
              <select
                className="input"
                name="discountId"
                value={discountId}
                onChange={(e) => setDiscountId(e.target.value)}
              >
                <option value="">None</option>
                {discounts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.discountType === 'percent' ? `${d.value}%` : formatLKR(Number(d.value))})
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
        </div>

        <div className="doc-lines-card">
          <div className="doc-lines-head">
            <span>Line items</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>
              Search SKU / name · 1 match auto-adds
            </span>
          </div>
          <div className="doc-lines-scroll">
            <table className="doc-lines-table">
              <thead>
                <tr>
                  <th className="col-item">SKU</th>
                  <th>Description</th>
                  <th className="col-qty">Qty</th>
                  <th className="col-price">Unit price</th>
                  <th className="col-amt">Amount</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={line.key}>
                    <td>
                      <input type="hidden" name={`line_${i}_productId`} value={line.productId} />
                      <span className="doc-line-sku">{line.sku || '—'}</span>
                    </td>
                    <td>
                      <input
                        className="input"
                        name={`line_${i}_description`}
                        value={line.description}
                        onChange={(e) => updateLine(line.key, { description: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        name={`line_${i}_quantity`}
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        name={`line_${i}_unitPrice`}
                        inputMode="decimal"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                      />
                    </td>
                    <td className="num">{money(computed.lineAmounts[i] ?? 0)}</td>
                    <td>
                      <button
                        type="button"
                        className="doc-line-remove"
                        aria-label="Remove line"
                        onClick={() => removeLine(line.key)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ color: 'var(--ink-soft)', fontSize: 13, padding: '10px 8px' }}>
                      No lines yet — search below to add products.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            {/* Always-visible add field (new empty row for next item) */}
            <div className="product-add-row">
              <label className="product-add-label">Add product</label>
              <ProductAddSearch
                products={products}
                onPick={pickProduct}
                placeholder="Type SKU or product name…"
                autoFocus
              />
            </div>
            {/* Fallback so empty submit still has a description if someone only types free text later */}
            {lines.length === 0 ? (
              <>
                <input type="hidden" name="line_0_productId" value="" />
                <input type="hidden" name="line_0_description" value="" />
                <input type="hidden" name="line_0_quantity" value="" />
                <input type="hidden" name="line_0_unitPrice" value="" />
              </>
            ) : null}
          </div>
        </div>

        <div className="doc-form-bottom">
          <div className="field doc-notes" style={{ margin: 0 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)' }}>Notes / message</label>
            <textarea className="input" name="notes" rows={3} placeholder="Optional notes on quote" />
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
              <span>Quote total</span>
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
          Save quotation
        </Button>
      </div>
    </form>
  );
}
