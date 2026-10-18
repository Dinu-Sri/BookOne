'use client';

/**
 * Shared create form for sales_order (and similar) using quote-grade line UX.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCommercialDocumentFromForm,
  loadInvoiceForReturn,
  searchInvoicesForReturn,
} from '@/app/actions/commercial-docs';
import {
  linkedReturnPreviewDisplay,
  SALES_RETURN_QTY_MESSAGE,
  type ProrateSourceLine,
} from '@bookone/accounting';
import { todayString } from '@/components/module/list-page';
import {
  DocumentLinesEditor,
  computeLineAmounts,
  preventOver100DiscountSubmit,
  preventReturnQtyExceededSubmit,
  submitRetainingFields,
  type DocLineState,
} from '@/components/module/document-lines-editor';
import type { ProductPick } from '@/components/module/product-add-search';
import {
  BrandLocationFields,
  type BrandOption,
  type LocationOption,
} from '@/components/module/brand-location-fields';
import { PartyNameFields } from '@/components/module/party-name-fields';
import { documentHasRentalLines, EventHireFields } from '@/components/sales/event-hire-fields';
import { Button } from '@/components/ui/bookone-ui';
import { IdempotencyField } from '@/components/ui/form-busy';
import { DiscountPicker } from '@/components/sales/discount-picker';

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
  brands,
  locations,
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
  brands?: BrandOption[];
  locations?: LocationOption[];
}) {
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [invoiceHits, setInvoiceHits] = useState<
    {
      id: string;
      documentNumber: string;
      taxInvoiceNumber: string | null;
      partyName: string;
      issueDate: string;
      total: number;
    }[]
  >([]);
  const [sourceInvoiceId, setSourceInvoiceId] = useState('');
  const [sourceInvoiceLabel, setSourceInvoiceLabel] = useState('');
  const [invoiceSearching, setInvoiceSearching] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const invoiceSearchRef = useRef<HTMLDivElement>(null);
  const [partyName, setPartyName] = useState(partyOptions[0]?.name ?? '');
  const [loadedBrandId, setLoadedBrandId] = useState('');
  const [loadedLocationId, setLoadedLocationId] = useState('');
  const isReturn = documentType === 'sales_return';

  const [headerDiscount, setHeaderDiscount] = useState('0');
  const [headerDiscountType, setHeaderDiscountType] = useState<'percent' | 'fixed'>('fixed');
  const [discountId, setDiscountId] = useState('');
  const [sourceHeaderDiscount, setSourceHeaderDiscount] = useState(0);
  const [sourceTotal, setSourceTotal] = useState(0);
  const [sourceNet, setSourceNet] = useState(0);
  const [sourceVatRate, setSourceVatRate] = useState(0);
  const [alreadyReturnedTotal, setAlreadyReturnedTotal] = useState(0);
  const [alreadyReturnedNet, setAlreadyReturnedNet] = useState(0);
  const [priorReturnLines, setPriorReturnLines] = useState<
    { productId: string | null; description: string; quantity: number }[]
  >([]);
  const [sourceQtyLines, setSourceQtyLines] = useState<
    { productId: string | null; description: string; quantity: number }[]
  >([]);
  const [sourcePricedLines, setSourcePricedLines] = useState<ProrateSourceLine[]>([]);
  const [lines, setLines] = useState<DocLineState[]>([]);
  const [catalog, setCatalog] = useState(initialProducts);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [pinDetailsExpanded, setPinDetailsExpanded] = useState(false);

  useEffect(() => {
    if (!isReturn) return;
    const q = invoiceQuery.trim();
    if (q.length < 2 || (sourceInvoiceId && q === sourceInvoiceLabel)) {
      setInvoiceHits([]);
      setInvoiceSearching(false);
      return;
    }
    const handle = window.setTimeout(() => {
      setInvoiceSearching(true);
      searchInvoicesForReturn(q)
        .then((hits) => {
          setInvoiceHits(hits);
          setInvoiceOpen(true);
        })
        .catch(() => setInvoiceHits([]))
        .finally(() => setInvoiceSearching(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [invoiceQuery, isReturn, sourceInvoiceId, sourceInvoiceLabel]);

  useEffect(() => {
    if (!invoiceOpen) return;
    function onDoc(e: MouseEvent) {
      if (!invoiceSearchRef.current?.contains(e.target as Node)) setInvoiceOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [invoiceOpen]);

  function clearSourceInvoice() {
    setSourceInvoiceId('');
    setSourceInvoiceLabel('');
    setInvoiceQuery('');
    setInvoiceHits([]);
    setInvoiceOpen(false);
    setLines([]);
    setHeaderDiscount('0');
    setHeaderDiscountType('fixed');
    setSourceHeaderDiscount(0);
    setSourceTotal(0);
    setSourceNet(0);
    setSourceVatRate(0);
    setAlreadyReturnedTotal(0);
    setAlreadyReturnedNet(0);
    setPriorReturnLines([]);
    setSourceQtyLines([]);
    setSourcePricedLines([]);
  }

  async function pickSourceInvoice(id: string, label: string) {
    const loaded = await loadInvoiceForReturn(id);
    if (!loaded) return;
    setSourceInvoiceId(id);
    setSourceInvoiceLabel(loaded.documentNumber || label);
    setPartyName(loaded.partyName);
    setLoadedBrandId(loaded.brandId ?? '');
    setLoadedLocationId(loaded.locationId ?? '');
    setInvoiceQuery(loaded.documentNumber);
    setInvoiceHits([]);
    setInvoiceOpen(false);
    setHeaderDiscount(String(loaded.headerDiscount || 0));
    setHeaderDiscountType('fixed');
    setDiscountId('');
    setSourceHeaderDiscount(loaded.headerDiscount || 0);
    setSourceTotal(loaded.sourceTotal || 0);
    setSourceNet(loaded.sourceNet || loaded.sourceTotal || 0);
    setSourceVatRate(loaded.vatRate || 0);
    setAlreadyReturnedTotal(loaded.alreadyReturnedTotal || 0);
    setAlreadyReturnedNet(loaded.alreadyReturnedNet || loaded.alreadyReturnedTotal || 0);
    setPriorReturnLines(loaded.priorReturnLines || []);
    setSourceQtyLines(
      loaded.lines.map((l) => ({
        productId: l.productId || null,
        description: l.description,
        quantity: Number(l.quantity) || 0,
      })),
    );
    setSourcePricedLines(
      loaded.lines.map((l) => ({
        productId: l.productId || null,
        description: l.description,
        quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0,
        discountAmount: Number(l.discountAmount) || 0,
      })),
    );
    setLines(
      loaded.lines.map((l) => ({
        key: `L-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        productId: l.productId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        sku: l.sku,
        isManual: !l.productId,
        discountType: l.discountAmount ? 'fixed' : 'percent',
        discountValue: l.discountAmount ?? '',
        sourceQuantity: l.quantity,
        sourceDiscountAmount: l.discountAmount ?? '0',
      })),
    );
  }

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
    if (sourceInvoiceId && sourcePricedLines.length > 0) {
      const preview = linkedReturnPreviewDisplay(
        sourcePricedLines,
        sourceHeaderDiscount,
        lines.map((l) => ({
          productId: l.productId || null,
          description: l.description,
          quantity: Number(String(l.quantity).replace(/[^0-9.-]/g, '')) || 0,
        })),
        {
          sourceTotal: sourceNet || sourceTotal,
          priorReturnTotal: alreadyReturnedNet || alreadyReturnedTotal,
          priorReturnLines,
        },
        sourceVatRate,
      );
      if (preview.kind === 'invalid-quantity') {
        return {
          invalidQuantity: true as const,
          enteredQty: preview.enteredQty,
          remainingQty: preview.remainingQty,
          subtotal: 0,
          discountAmt: 0,
          total: 0,
        };
      }
      return {
        invalidQuantity: false as const,
        subtotal: preview.subtotal,
        discountAmt: preview.headerDiscount,
        total: preview.total,
      };
    }
    const lineAmounts = computeLineAmounts(lines);
    const subtotal = Math.round(lineAmounts.reduce((s, a) => s + a, 0) * 100) / 100;
    let discountAmt = 0;
    if (discountId) {
      const d = discounts.find((x) => x.id === discountId);
      if (d) {
        discountAmt =
          d.discountType === 'percent'
            ? Math.round(((subtotal * Number(d.value)) / 100) * 100) / 100
            : Number(d.value);
      }
    } else {
      const v = Number(String(headerDiscount).replace(/[^0-9.-]/g, '')) || 0;
      if (v > 0) {
        discountAmt =
          headerDiscountType === 'percent'
            ? Math.round(((subtotal * v) / 100) * 100) / 100
            : v;
      }
    }
    discountAmt = Math.min(Math.max(0, discountAmt), subtotal);
    const total = Math.round((subtotal - discountAmt) * 100) / 100;
    return { invalidQuantity: false as const, subtotal, discountAmt, total };
  }, [
    lines,
    headerDiscount,
    headerDiscountType,
    discountId,
    discounts,
    sourceInvoiceId,
    sourceHeaderDiscount,
    sourcePricedLines,
    sourceTotal,
    sourceNet,
    sourceVatRate,
    alreadyReturnedTotal,
    alreadyReturnedNet,
    priorReturnLines,
  ]);

  return (
    <form
      className="doc-form-shell"
      onSubmit={async (e) => {
        if (preventOver100DiscountSubmit(e, lines)) return;
        if (
          isReturn &&
          preventReturnQtyExceededSubmit(
            e,
            sourceQtyLines,
            priorReturnLines,
            lines,
            SALES_RETURN_QTY_MESSAGE,
          )
        ) {
          return;
        }
        await submitRetainingFields(e, createCommercialDocumentFromForm);
      }}
    >
      <IdempotencyField />
      <input type="hidden" name="documentType" value={documentType} />
      <input type="hidden" name="saleChannel" value="local" />
      <input type="hidden" name="invoiceKind" value="commercial" />
      <input type="hidden" name="lineCount" value={String(Math.max(lines.length, 1))} />
      <input type="hidden" name="headerDiscount" value={String(computed.discountAmt)} />
      {sourceInvoiceId ? <input type="hidden" name="sourceDocumentId" value={sourceInvoiceId} /> : null}

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
          {isReturn ? (
            <div className="field invoice-return-search" ref={invoiceSearchRef}>
              <label htmlFor="invoice-return-q">Find invoice to return</label>
              <div className="invoice-return-row">
                <input
                  id="invoice-return-q"
                  className="input"
                  type="search"
                  value={invoiceQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setInvoiceQuery(next);
                    if (sourceInvoiceId && next.trim() !== sourceInvoiceLabel) {
                      setSourceInvoiceId('');
                      setSourceInvoiceLabel('');
                    }
                  }}
                  onFocus={() => {
                    if (invoiceHits.length > 0) setInvoiceOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setInvoiceOpen(false);
                  }}
                  placeholder="Type invoice number or customer name…"
                  autoComplete="off"
                />
                {sourceInvoiceId ? (
                  <Button variant="secondary" type="button" onClick={clearSourceInvoice}>
                    Clear
                  </Button>
                ) : null}
                {invoiceOpen && invoiceHits.length > 0 ? (
                  <ul className="invoice-return-hits" role="listbox">
                    {invoiceHits.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          onClick={() => pickSourceInvoice(hit.id, hit.documentNumber)}
                        >
                          <strong>{hit.documentNumber}</strong>
                          {hit.taxInvoiceNumber ? <span> · {hit.taxInvoiceNumber}</span> : null}
                          <span>
                            {hit.partyName} · {hit.issueDate} · LKR {money(hit.total)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {invoiceOpen && invoiceQuery.trim().length >= 2 && !invoiceSearching && invoiceHits.length === 0 ? (
                  <div className="invoice-return-hits invoice-return-empty">No matching invoices</div>
                ) : null}
              </div>
              {invoiceSearching ? <small className="muted-line">Searching…</small> : null}
              {!invoiceSearching && sourceInvoiceId ? (
                <small className="muted-line">
                  Loaded {sourceInvoiceLabel}. All lines copied — change qty for a partial return.
                </small>
              ) : !invoiceSearching ? (
                <small className="muted-line">Type at least 2 characters. Selecting copies customer, brand, location, and lines.</small>
              ) : null}
            </div>
          ) : null}
          <PartyNameFields
            label="Customer"
            placeholder="Customer name"
            partyOptions={partyOptions}
            partyName={partyName}
            onPartyNameChange={setPartyName}
            overridePlaceholder="Walk-in / new"
            locked={Boolean(sourceInvoiceId)}
          />
          <div className="field">
            <label>Date *</label>
            <input className="input" name="issueDate" type="date" defaultValue={todayString()} required />
          </div>
          <div className="field">
            <label>Due date</label>
            <input className="input" name="dueDate" type="date" />
          </div>
          <DiscountPicker
            discounts={discounts}
            discountId={discountId}
            onDiscountId={setDiscountId}
            headerDiscount={headerDiscount}
            headerDiscountType={headerDiscountType}
            onHeaderDiscount={setHeaderDiscount}
            onHeaderDiscountType={setHeaderDiscountType}
            amountLabel="Header discount"
          />
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
          <BrandLocationFields
            key={`${sourceInvoiceId}-${loadedBrandId}-${loadedLocationId}`}
            brands={brands}
            locations={locations}
            defaultBrandId={loadedBrandId}
            defaultLocationId={loadedLocationId}
          />
          {documentType === 'sales_order' || documentType === 'sales_invoice' ? (
            <EventHireFields visible={documentHasRentalLines(lines, catalog)} />
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
            {computed.invalidQuantity ? (
              <div className="doc-totals-row" style={{ color: 'var(--danger, #b91c1c)' }}>
                <span>
                  Return quantity {computed.enteredQty} exceeds remaining {computed.remainingQty}.
                  Save is refused. This is not a source discount.
                </span>
              </div>
            ) : (
              <>
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
              </>
            )}
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
