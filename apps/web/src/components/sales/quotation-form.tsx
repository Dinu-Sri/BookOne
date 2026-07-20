'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { createCommercialDocumentFromForm } from '@/app/actions/commercial-docs';
import { formatLKR, todayString } from '@/components/module/list-page';
import {
  DocumentLinesEditor,
  computeLineAmounts,
  type DocLineState,
} from '@/components/module/document-lines-editor';
import type { ProductPick } from '@/components/module/product-add-search';
import {
  BrandLocationFields,
  type BrandOption,
  type LocationOption,
} from '@/components/module/brand-location-fields';
import { Button } from '@/components/ui/bookone-ui';

type PartyOpt = {
  id: string;
  name: string;
  code: string | null;
  creditLimit: number | null;
  openBalance: number;
  status: string;
};
type DiscountOpt = { id: string; name: string; discountType: string; value: string | number };

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function QuotationForm({
  products: initialProducts,
  partyOptions,
  discounts,
  brands,
  locations,
  backHref = '/sales/quotations',
}: {
  products: ProductPick[];
  partyOptions: PartyOpt[];
  discounts: DiscountOpt[];
  brands?: BrandOption[];
  locations?: LocationOption[];
  backHref?: string;
}) {
  const today = todayString();
  const [issueDate, setIssueDate] = useState(today);
  const [goodThru, setGoodThru] = useState(addDaysIso(today, 30));
  const [headerDiscount, setHeaderDiscount] = useState('0');
  const [discountId, setDiscountId] = useState('');
  const [lines, setLines] = useState<DocLineState[]>([]);
  const [catalog, setCatalog] = useState(initialProducts);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [pinDetailsExpanded, setPinDetailsExpanded] = useState(false);

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

  function expandDetails() {
    setDetailsCollapsed(false);
    setPinDetailsExpanded(true);
  }

  const computed = useMemo(() => {
    const lineAmounts = computeLineAmounts(lines);
    const subtotal = Math.round(lineAmounts.reduce((s, a) => s + a, 0) * 100) / 100;
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
    return { subtotal, discountAmt, total };
  }, [lines, headerDiscount, discountId, discounts]);

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
        {detailsCollapsed ? (
          <button type="button" className="doc-details-collapsed-bar" onClick={expandDetails}>
            <span>
              <strong>Quotation details</strong>
              <small>Click to expand customer, dates, terms…</small>
            </span>
            <span className="doc-details-collapsed-hint">Expand</span>
          </button>
        ) : null}

        <div className={`doc-form-header ${detailsCollapsed ? 'is-collapsed' : ''}`}>
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
          <BrandLocationFields brands={brands} locations={locations} />
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

        <DocumentLinesEditor
          products={catalog}
          lines={lines}
          onChange={setLines}
          onSearchActive={handleSearchActive}
          onCatalogProduct={(p) =>
            setCatalog((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]))
          }
        />

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
