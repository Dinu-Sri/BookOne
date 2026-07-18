'use client';

/**
 * Shared create form for sales_order (and similar) using quote-grade line UX.
 */

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
import { Button } from '@/components/ui/bookone-ui';

type PartyOpt = {
  id: string;
  name: string;
  code: string | null;
  creditLimit?: number | null;
  openBalance?: number;
  status?: string;
};
type DiscountOpt = { id: string; name: string; discountType: string; value: string | number };

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SalesDocumentForm({
  documentType,
  backHref,
  backLabel,
  submitLabel,
  products: initialProducts,
  partyOptions,
  discounts = [],
  showPaymentAccount,
  paymentAccounts,
  defaultPaymentCode,
  banner,
}: {
  documentType: 'sales_order' | 'sales_invoice' | 'pos_sale' | 'sales_return';
  backHref: string;
  backLabel: string;
  submitLabel: string;
  products: ProductPick[];
  partyOptions: PartyOpt[];
  discounts?: DiscountOpt[];
  showPaymentAccount?: boolean;
  paymentAccounts?: { code: string; name: string }[];
  defaultPaymentCode?: string;
  banner?: string;
}) {
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
    return { subtotal, discountAmt, total: Math.round((subtotal - discountAmt) * 100) / 100 };
  }, [lines, headerDiscount, discountId, discounts]);

  return (
    <form action={createCommercialDocumentFromForm} className="doc-form-shell">
      <input type="hidden" name="documentType" value={documentType} />
      <input type="hidden" name="lineCount" value={String(Math.max(lines.length, 1))} />
      <input type="hidden" name="headerDiscount" value={String(computed.discountAmt)} />

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
            <label>Date *</label>
            <input className="input" name="issueDate" type="date" defaultValue={todayString()} required />
          </div>
          <div className="field">
            <label>Due date</label>
            <input className="input" name="dueDate" type="date" />
          </div>
          {discounts.length > 0 ? (
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
  );
}
