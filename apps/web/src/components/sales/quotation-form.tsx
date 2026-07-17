'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { createCommercialDocumentFromForm } from '@/app/actions/commercial-docs';
import { formatLKR, todayString } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';

type ProductOpt = { id: string; name: string; sellPrice: number; unitCost: number };
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
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

const EMPTY_LINE = (): LineState => ({
  productId: '',
  description: '',
  quantity: '',
  unitPrice: '',
});

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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
  const [lines, setLines] = useState<LineState[]>(() => {
    const first = products[0];
    return [
      {
        productId: first?.id ?? '',
        description: first?.name ?? '',
        quantity: '1',
        unitPrice: first ? String(first.sellPrice) : '',
      },
      EMPTY_LINE(),
      EMPTY_LINE(),
      EMPTY_LINE(),
      EMPTY_LINE(),
    ];
  });

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const computed = useMemo(() => {
    let subtotal = 0;
    const lineAmounts = lines.map((line) => {
      const qty = Number(String(line.quantity).replace(/[^0-9.-]/g, '')) || 0;
      const price = Number(String(line.unitPrice).replace(/[^0-9.-]/g, '')) || 0;
      const hasContent = Boolean(line.productId || line.description.trim());
      const amount = hasContent ? Math.round(qty * price * 100) / 100 : 0;
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

  function updateLine(index: number, patch: Partial<LineState>) {
    setLines((prev) => {
      const next = [...prev];
      const line = { ...next[index], ...patch };
      if (patch.productId !== undefined) {
        const p = productMap.get(patch.productId);
        if (p) {
          line.description = p.name;
          line.unitPrice = String(p.sellPrice);
          if (!line.quantity) line.quantity = '1';
        }
      }
      next[index] = line;
      return next;
    });
  }

  function addLine() {
    setLines((prev) => [...prev, EMPTY_LINE()]);
  }

  return (
    <form action={createCommercialDocumentFromForm} className="doc-form-shell">
      <input type="hidden" name="documentType" value="quotation" />
      <input type="hidden" name="lineCount" value={String(lines.length)} />
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
        {/* Sage-style header: customer + dates + refs */}
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

        {/* Line grid — scrollable so rows never clip */}
        <div className="doc-lines-card">
          <div className="doc-lines-head">
            <span>Line items</span>
            <button type="button" className="button secondary" style={{ minHeight: 30, padding: '4px 10px' }} onClick={addLine}>
              + Add line
            </button>
          </div>
          <div className="doc-lines-scroll">
            <table className="doc-lines-table">
              <thead>
                <tr>
                  <th className="col-item">Item</th>
                  <th>Description</th>
                  <th className="col-qty">Qty</th>
                  <th className="col-price">Unit price</th>
                  <th className="col-amt">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        className="input"
                        name={`line_${i}_productId`}
                        value={line.productId}
                        onChange={(e) => updateLine(i, { productId: e.target.value })}
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
                        value={line.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                        placeholder={i === 0 ? 'Description' : 'Optional'}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        name={`line_${i}_quantity`}
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateLine(i, { quantity: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        name={`line_${i}_unitPrice`}
                        inputMode="decimal"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                      />
                    </td>
                    <td className="num">{money(computed.lineAmounts[i] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        <Button variant="primary" type="submit">
          Save quotation
        </Button>
      </div>
    </form>
  );
}
