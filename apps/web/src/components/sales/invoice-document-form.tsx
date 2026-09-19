'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { createCommercialDocumentFromForm, loadOrdersForInvoice } from '@/app/actions/commercial-docs';
import { todayString } from '@/components/module/list-page';
import { pushStatusToast } from '@/components/layout/status-toast';
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
import { documentHasRentalLines, EventHireFields } from '@/components/sales/event-hire-fields';
import { Button } from '@/components/ui/bookone-ui';
import { DiscountPicker, type DiscountPick } from '@/components/sales/discount-picker';

type PartyOpt = { id: string; name: string; code: string | null };
type OrderOpt = { id: string; documentNumber: string; partyName: string; total: number; status: string };

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type DraftInvoice = {
  id: string;
  documentNumber: string;
  partyName: string;
  issueDate: string;
  dueDate: string | null;
  deliveryDate: string | null;
  saleChannel: string;
  invoiceKind: string;
  paymentMode: string | null;
  notes: string | null;
  additionalInfo?: string | null;
  brandId: string | null;
  locationId: string | null;
  headerDiscount: number;
  lines: { id: string; productId: string | null; description: string; quantity: number; unitPrice: number }[];
};

export function InvoiceDocumentForm({
  products: initialProducts,
  partyOptions,
  settings,
  openOrders,
  brands,
  locations,
  discounts = [],
  draft,
}: {
  products: ProductPick[];
  partyOptions: PartyOpt[];
  settings: {
    defaultSaleChannel: string;
    defaultInvoiceKind: string;
    vatRegistered: boolean;
    vatRatePercent: number;
  };
  openOrders: OrderOpt[];
  brands?: BrandOption[];
  locations?: LocationOption[];
  discounts?: DiscountPick[];
  draft?: DraftInvoice;
}) {
  const [lines, setLines] = useState<DocLineState[]>(() =>
    draft
      ? draft.lines.map((l) => ({
          key: l.id,
          productId: l.productId ?? '',
          description: l.description,
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
        }))
      : [],
  );
  const [catalog, setCatalog] = useState(initialProducts);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [pinDetailsExpanded, setPinDetailsExpanded] = useState(false);
  const [saleChannel, setSaleChannel] = useState(draft?.saleChannel || 'local');
  const [invoiceKind, setInvoiceKind] = useState(draft?.invoiceKind || 'commercial');
  const [headerDiscount, setHeaderDiscount] = useState(
    draft && draft.headerDiscount > 0 ? String(draft.headerDiscount) : '0',
  );
  const [headerDiscountType, setHeaderDiscountType] = useState<'percent' | 'fixed'>(
    draft && draft.headerDiscount > 0 ? 'fixed' : 'percent',
  );
  const [discountId, setDiscountId] = useState('');
  const [partyName, setPartyName] = useState(draft?.partyName || partyOptions[0]?.name || '');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [loadedBrandId, setLoadedBrandId] = useState(draft?.brandId ?? '');
  const [loadedLocationId, setLoadedLocationId] = useState(draft?.locationId ?? '');
  const [combineOpen, setCombineOpen] = useState(false);
  const [combineCustomer, setCombineCustomer] = useState('');
  const [combinePicked, setCombinePicked] = useState<string[]>([]);
  const [combineBusy, setCombineBusy] = useState(false);
  const showExportFields = saleChannel === 'export';
  const showTaxFields = invoiceKind === 'tax_invoice';
  const showHireFields = documentHasRentalLines(lines, catalog);

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
    const amts = computeLineAmounts(lines);
    const subtotal = Math.round(amts.reduce((s, a) => s + a, 0) * 100) / 100;
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
            : Math.round(v * 100) / 100;
      }
    }
    discountAmt = Math.min(Math.max(0, discountAmt), subtotal);
    return { subtotal, discountAmt, total: Math.round((subtotal - discountAmt) * 100) / 100 };
  }, [lines, headerDiscount, headerDiscountType, discountId, discounts]);

  const combineCustomers = useMemo(() => {
    const names = [...new Set(openOrders.map((o) => o.partyName).filter(Boolean))];
    names.sort((a, b) => a.localeCompare(b));
    return names;
  }, [openOrders]);

  const combineOrders = useMemo(
    () => (combineCustomer ? openOrders.filter((o) => o.partyName === combineCustomer) : []),
    [openOrders, combineCustomer],
  );

  function openCombine() {
    setCombineCustomer(partyName && openOrders.some((o) => o.partyName === partyName) ? partyName : combineCustomers[0] ?? '');
    setCombinePicked([]);
    setCombineOpen(true);
  }

  async function applyCombinedOrders() {
    if (combinePicked.length === 0) {
      pushStatusToast({ kind: 'error', message: 'Tick at least one sales order.' });
      return;
    }
    setCombineBusy(true);
    try {
      const loaded = await loadOrdersForInvoice(combinePicked);
      if (!loaded) return;
      if (loaded.error) {
        pushStatusToast({ kind: 'error', message: loaded.error });
        return;
      }
      if (loaded.partyName) setPartyName(loaded.partyName);
      setLoadedBrandId(loaded.brandId ?? '');
      setLoadedLocationId(loaded.locationId ?? '');
      setSelectedOrderIds([...new Set([...selectedOrderIds, ...combinePicked])]);
      setLines((prev) => [
        ...prev,
        ...loaded.lines.map((l) => ({
          key: `L-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          productId: l.productId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          sku: l.sku,
          isManual: !l.productId,
          discountType: l.discountAmount ? ('fixed' as const) : ('percent' as const),
          discountValue: l.discountAmount ?? '',
        })),
      ]);
      setCombineOpen(false);
      pushStatusToast({
        kind: 'success',
        message: `Added ${loaded.lines.length} line${loaded.lines.length === 1 ? '' : 's'} from ${combinePicked.length} order${combinePicked.length === 1 ? '' : 's'}.`,
      });
    } finally {
      setCombineBusy(false);
    }
  }

  return (
    <form action={createCommercialDocumentFromForm} className="doc-form-shell">
      <input type="hidden" name="documentType" value="sales_invoice" />
      <input type="hidden" name="lineCount" value={String(Math.max(lines.length, 1))} />
      <input type="hidden" name="headerDiscount" value={String(computed.discountAmt)} />
      {draft ? <input type="hidden" name="existingDraftId" value={draft.id} /> : null}
      {selectedOrderIds.map((id) => (
        <input key={id} type="hidden" name="sourceOrderIds" value={id} />
      ))}

      <div className="party-form-top">
        <Link href="/sales/invoices" className="party-back-btn">
          <span className="party-back-arrow">←</span>
          <span>
            <strong>Back to list</strong>
            <small>Sales invoices</small>
          </span>
        </Link>
        {openOrders.length > 0 ? (
          <Button variant="secondary" type="button" onClick={openCombine}>
            Combine sales orders
          </Button>
        ) : null}
        <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
          {draft
            ? `Draft ${draft.documentNumber} · edit lines, then Post`
            : 'Save draft to edit later · Post writes stock and ledger'}
        </div>
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
              <strong>Invoice details</strong>
              <small>Click to expand</small>
            </span>
            <span className="doc-details-collapsed-hint">Expand</span>
          </button>
        ) : null}

        <div className={`doc-form-header ${detailsCollapsed ? 'is-collapsed' : ''}`}>
          <div className="field">
            <label>Sale channel</label>
            <select
              className="input"
              name="saleChannel"
              value={saleChannel}
              onChange={(e) => setSaleChannel(e.target.value)}
            >
              <option value="local">Local sales</option>
              <option value="export">Export sales</option>
            </select>
          </div>
          <div className="field">
            <label>Invoice kind</label>
            <select
              className="input"
              name="invoiceKind"
              value={invoiceKind}
              onChange={(e) => setInvoiceKind(e.target.value)}
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
            {partyOptions.length > 0 ? (
              <select
                className="input"
                name="partyName"
                value={partyName}
                onChange={(e) => {
                  setPartyName(e.target.value);
                  setSelectedOrderIds([]);
                }}
                required
              >
                {partyName && !partyOptions.some((p) => p.name === partyName) ? (
                  <option value={partyName}>{partyName}</option>
                ) : null}
                {partyOptions.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.code ? `${p.code} — ` : ''}
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                name="partyName"
                required
                placeholder="Customer name"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
              />
            )}
          </div>
          <div className="field">
            <label>Or type name</label>
            <input className="input" name="partyNameOverride" placeholder="Walk-in / new" />
          </div>
          <div className="field">
            <label>Invoice date *</label>
            <input
              className="input"
              name="issueDate"
              type="date"
              defaultValue={draft?.issueDate || todayString()}
              required
            />
          </div>
          <div className="field">
            <label>Date of delivery</label>
            <input
              className="input"
              name="deliveryDate"
              type="date"
              defaultValue={draft?.deliveryDate || todayString()}
            />
          </div>
          <div className="field">
            <label>Due date</label>
            <input className="input" name="dueDate" type="date" defaultValue={draft?.dueDate ?? ''} />
          </div>
          <BrandLocationFields
            key={`${loadedBrandId}-${loadedLocationId}`}
            brands={brands}
            locations={locations}
            defaultBrandId={loadedBrandId || draft?.brandId || ''}
            defaultLocationId={loadedLocationId || draft?.locationId || ''}
          />
          <EventHireFields visible={showHireFields} />
          <div className="field">
            <label>Mode of payment</label>
            <select className="input" name="paymentMode" defaultValue={draft?.paymentMode || 'Credit'}>
              <option value="Credit">Credit</option>
              <option value="Cash">Cash</option>
              <option value="Bank">Bank</option>
              <option value="Card">Card</option>
              <option value="Other">Other</option>
            </select>
          </div>
          {showTaxFields ? (
            <>
              <div className="field field-span-2">
                <label>Place of supply</label>
                <input className="input" name="placeOfSupply" placeholder="e.g. Colombo" />
              </div>
              <div className="field">
                <label>Purchaser TIN</label>
                <input className="input" name="purchaserTin" />
              </div>
              <div className="field">
                <label>Purchaser phone</label>
                <input className="input" name="purchaserPhone" />
              </div>
              <div className="field field-span-2">
                <label>Purchaser address</label>
                <input className="input" name="purchaserAddress" />
              </div>
            </>
          ) : null}
          {showExportFields ? (
            <>
              <div className="field">
                <label>Export country</label>
                <input className="input" name="exportCountry" />
              </div>
              <div className="field">
                <label>Export ref</label>
                <input className="input" name="exportRef" />
              </div>
            </>
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
          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)' }}>Notes</label>
            <input className="input" name="notes" defaultValue={draft?.notes ?? ''} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <DiscountPicker
              discounts={discounts}
              discountId={discountId}
              onDiscountId={setDiscountId}
              headerDiscount={headerDiscount}
              headerDiscountType={headerDiscountType}
              onHeaderDiscount={setHeaderDiscount}
              onHeaderDiscountType={setHeaderDiscountType}
              amountLabel="Invoice discount"
            />
          </div>
          <div className="doc-totals">
            <div className="doc-totals-row">
              <span>Subtotal</span>
              <strong>LKR {money(computed.subtotal)}</strong>
            </div>
            {computed.discountAmt > 0 ? (
              <div className="doc-totals-row">
                <span>Discount</span>
                <strong>− LKR {money(computed.discountAmt)}</strong>
              </div>
            ) : null}
            <div className="doc-totals-row is-total">
              <span>Total (ex-VAT)</span>
              <strong>LKR {money(computed.total)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="doc-form-footer">
        <Link href="/sales/invoices">
          <Button variant="secondary" type="button">
            Cancel
          </Button>
        </Link>
        <Button variant="secondary" type="submit" name="intent" value="draft" disabled={lines.length === 0}>
          Save draft
        </Button>
        <Button variant="primary" type="submit" name="intent" value="post" disabled={lines.length === 0}>
          Post
        </Button>
        <Button variant="primary" type="submit" name="intent" value="post_print" disabled={lines.length === 0}>
          Post & print
        </Button>
      </div>

      {combineOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!combineBusy) setCombineOpen(false);
          }}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="combine-so-title"
            style={{ width: 'min(560px, 100%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="combine-so-title" className="modal-title">
              Combine sales orders
            </h2>
            <p className="modal-message">Pick a customer, tick their open orders, then OK to add those lines to this invoice.</p>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Customer</label>
              <select
                className="input"
                value={combineCustomer}
                onChange={(e) => {
                  setCombineCustomer(e.target.value);
                  setCombinePicked([]);
                }}
              >
                {combineCustomers.length === 0 ? <option value="">No open orders</option> : null}
                {combineCustomers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="combine-so-list">
              {combineOrders.length === 0 ? (
                <p className="muted-line">No open sales orders for this customer.</p>
              ) : (
                combineOrders.map((o) => (
                  <label key={o.id} className="party-check">
                    <input
                      type="checkbox"
                      checked={combinePicked.includes(o.id)}
                      onChange={(e) => {
                        setCombinePicked((prev) =>
                          e.target.checked ? [...prev, o.id] : prev.filter((id) => id !== o.id),
                        );
                      }}
                    />
                    <span>
                      <strong>{o.documentNumber}</strong>
                      {' · '}
                      LKR {o.total.toLocaleString()}
                    </span>
                  </label>
                ))
              )}
            </div>
            <div className="cluster" style={{ justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
              <Button variant="secondary" type="button" disabled={combineBusy} onClick={() => setCombineOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="button"
                disabled={combineBusy || combinePicked.length === 0}
                onClick={() => applyCombinedOrders()}
              >
                OK
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
