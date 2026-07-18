'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { createCommercialDocumentFromForm } from '@/app/actions/commercial-docs';
import { todayString } from '@/components/module/list-page';
import {
  DocumentLinesEditor,
  computeLineAmounts,
  type DocLineState,
} from '@/components/module/document-lines-editor';
import type { ProductPick } from '@/components/module/product-add-search';
import { Button } from '@/components/ui/bookone-ui';

type PartyOpt = { id: string; name: string; code: string | null };
type OrderOpt = { id: string; documentNumber: string; partyName: string; total: number; status: string };

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InvoiceDocumentForm({
  products: initialProducts,
  partyOptions,
  settings,
  openOrders,
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
}) {
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

  const subtotal = useMemo(() => {
    const amts = computeLineAmounts(lines);
    return Math.round(amts.reduce((s, a) => s + a, 0) * 100) / 100;
  }, [lines]);

  return (
    <form action={createCommercialDocumentFromForm} className="doc-form-shell">
      <input type="hidden" name="documentType" value="sales_invoice" />
      <input type="hidden" name="lineCount" value={String(Math.max(lines.length, 1))} />

      <div className="party-form-top">
        <Link href="/sales/invoices" className="party-back-btn">
          <span className="party-back-arrow">←</span>
          <span>
            <strong>Back to list</strong>
            <small>Sales invoices</small>
          </span>
        </Link>
        <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
          Posts to ledger · commercial default
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
            <select className="input" name="saleChannel" defaultValue={settings.defaultSaleChannel}>
              <option value="local">Local sales</option>
              <option value="export">Export sales</option>
            </select>
          </div>
          <div className="field">
            <label>Invoice kind</label>
            <select
              className="input"
              name="invoiceKind"
              defaultValue={settings.vatRegistered ? settings.defaultInvoiceKind : 'commercial'}
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
            <label>Or type name</label>
            <input className="input" name="partyNameOverride" placeholder="Walk-in / new" />
          </div>
          <div className="field">
            <label>Invoice date *</label>
            <input className="input" name="issueDate" type="date" defaultValue={todayString()} required />
          </div>
          <div className="field">
            <label>Date of delivery</label>
            <input className="input" name="deliveryDate" type="date" defaultValue={todayString()} />
          </div>
          <div className="field">
            <label>Due date</label>
            <input className="input" name="dueDate" type="date" />
          </div>
          <div className="field">
            <label>Mode of payment</label>
            <select className="input" name="paymentMode" defaultValue="Credit">
              <option value="Credit">Credit</option>
              <option value="Cash">Cash</option>
              <option value="Bank">Bank</option>
              <option value="Card">Card</option>
              <option value="Other">Other</option>
            </select>
          </div>
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
          <div className="field">
            <label>Export country</label>
            <input className="input" name="exportCountry" />
          </div>
          <div className="field">
            <label>Export ref</label>
            <input className="input" name="exportRef" />
          </div>
        </div>

        {openOrders.length > 0 ? (
          <div className="doc-lines-card" style={{ minHeight: 0, maxHeight: 140, marginBottom: 12 }}>
            <div className="doc-lines-head">
              <span>Link sales orders (optional)</span>
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
                  {openOrders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <input type="checkbox" name="sourceOrderIds" value={o.id} />
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

        <div className="doc-form-bottom">
          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)' }}>
              Additional information
            </label>
            <input className="input" name="additionalInfo" />
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', marginTop: 8 }}>
              Notes
            </label>
            <input className="input" name="notes" />
          </div>
          <div className="doc-totals">
            <div className="doc-totals-row is-total">
              <span>Lines total (ex-VAT)</span>
              <strong>LKR {money(subtotal)}</strong>
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
        <Button variant="primary" type="submit" disabled={lines.length === 0}>
          Save invoice
        </Button>
      </div>
    </form>
  );
}
