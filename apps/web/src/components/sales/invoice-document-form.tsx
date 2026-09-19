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

  const ordersForCustomer = useMemo(
    () => openOrders.filter((o) => !partyName || o.partyName === partyName),
    [openOrders, partyName],
  );

  async function toggleOrder(id: string, checked: boolean) {
    const next = checked ? [...selectedOrderIds, id] : selectedOrderIds.filter((x) => x !== id);
    setSelectedOrderIds(next);
    if (next.length === 0) {
      setLines([]);
      return;
    }
    const loaded = await loadOrdersForInvoice(next);
    if (!loaded) return;
    if (loaded.error) {
      pushStatusToast({ kind: 'error', message: loaded.error });
      setSelectedOrderIds(selectedOrderIds);
      return;
    }
    if (loaded.partyName) setPartyName(loaded.partyName);
    setLoadedBrandId(loaded.brandId ?? '');
    setLoadedLocationId(loaded.locationId ?? '');
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
      })),
    );
  }

  return (
    <form action={createCommercialDocumentFromForm} className="doc-form-shell">
      <input type="hidden" name="documentType" value="sales_invoice" />
      <input type="hidden" name="lineCount" value={String(Math.max(lines.length, 1))} />
      <input type="hidden" name="headerDiscount" value={String(computed.discountAmt)} />
      {draft ? <input type="hidden" name="existingDraftId" value={draft.id} /> : null}

      <div className="party-form-top">
        <Link href="/sales/invoices" className="party-back-btn">
          <span className="party-back-arrow">←</span>
          <span>
            <strong>Back to list</strong>
            <small>Sales invoices</small>
          </span>
        </Link>
        <div className="doc-totals-live" aria-live="polite">
          <div>
            <span>Subtotal</span>
            <strong>LKR {money(computed.subtotal)}</strong>
          </div>
          {computed.discountAmt > 0 ? (
            <div>
              <span>Discount</span>
              <strong>− LKR {money(computed.discountAmt)}</strong>
            </div>
          ) : null}
          <div className="is-total">
            <span>Total</span>
            <strong>LKR {money(computed.total)}</strong>
          </div>
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
          <div className="field field-span-2">
            <label>Notes</label>
            <input className="input" name="notes" defaultValue={draft?.notes ?? ''} placeholder="Optional notes on the invoice" />
          </div>
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

        {ordersForCustomer.length > 0 ? (
          <div className="doc-lines-card" style={{ minHeight: 0, maxHeight: 160 }}>
            <div className="doc-lines-head">
              <span>Combine sales orders</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>
                Same customer only — tick orders to pull all lines onto this invoice
              </span>
            </div>
            <div className="doc-lines-scroll">
              <table className="doc-lines-table">
                <thead>
                  <tr>
                    <th />
                    <th>Number</th>
                    <th>Customer</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersForCustomer.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <input
                          type="checkbox"
                          name="sourceOrderIds"
                          value={o.id}
                          checked={selectedOrderIds.includes(o.id)}
                          onChange={(e) => toggleOrder(o.id, e.target.checked)}
                        />
                      </td>
                      <td>
                        <strong>{o.documentNumber}</strong>
                      </td>
                      <td>{o.partyName}</td>
                      <td>LKR {o.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <DocumentLinesEditor
          products={catalog}
          lines={lines}
          onChange={setLines}
          onSearchActive={handleSearchActive}
          onCatalogProduct={(p) =>
            setCatalog((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]))
          }
        />
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
    </form>
  );
}
