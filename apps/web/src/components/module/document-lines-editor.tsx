'use client';

/**
 * Shared line-item editor for quotes, sales orders, invoices, etc.
 * Product search + free text + qty steppers + Save as product (type).
 */

import { useState } from 'react';
import { createQuickProduct } from '@/app/actions/inventory';
import { ProductAddSearch, type ProductPick } from '@/components/module/product-add-search';
import { QtyStepper } from '@/components/module/qty-stepper';
import { pushStatusToast } from '@/components/layout/status-toast';

export type DocLineState = {
  key: string;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  sku?: string;
  isManual?: boolean;
  /** Pending save-as-product type before linking */
  saveAsType?: 'physical' | 'digital' | 'service';
};

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function newKey() {
  return `L-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyDocLines(): DocLineState[] {
  return [];
}

export function computeLineAmounts(lines: DocLineState[]) {
  return lines.map((line) => {
    const qty = Number(String(line.quantity).replace(/[^0-9.-]/g, '')) || 0;
    const price = Number(String(line.unitPrice).replace(/[^0-9.-]/g, '')) || 0;
    return Math.round(qty * price * 100) / 100;
  });
}

export function DocumentLinesEditor({
  products,
  lines,
  onChange,
  onCatalogProduct,
  onSearchActive,
  hint = 'Search catalog · or Enter free text if no match',
}: {
  products: ProductPick[];
  lines: DocLineState[];
  onChange: (lines: DocLineState[]) => void;
  /** Called when a new product is quick-created so parent can add to catalog list */
  onCatalogProduct?: (p: ProductPick) => void;
  onSearchActive?: (active: boolean) => void;
  hint?: string;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const amounts = computeLineAmounts(lines);

  function updateLine(key: string, patch: Partial<DocLineState>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    onChange(lines.filter((l) => l.key !== key));
  }

  function pickProduct(p: ProductPick) {
    onChange([
      ...lines,
      {
        key: newKey(),
        productId: p.id,
        description: p.name,
        quantity: '1',
        unitPrice: String(p.sellPrice),
        sku: p.sku,
        isManual: false,
      },
    ]);
  }

  function pickManual(description: string) {
    onChange([
      ...lines,
      {
        key: newKey(),
        productId: '',
        description,
        quantity: '1',
        unitPrice: '',
        sku: 'MANUAL',
        isManual: true,
        saveAsType: 'service',
      },
    ]);
  }

  async function saveAsProduct(line: DocLineState) {
    if (!line.isManual || line.productId) return;
    setBusyKey(line.key);
    try {
      const res = await createQuickProduct({
        name: line.description.trim() || 'Item',
        productType: line.saveAsType ?? 'service',
        sellPrice: Number(String(line.unitPrice).replace(/[^0-9.-]/g, '')) || 0,
        unitCost: 0,
      });
      if (!res.ok || !res.product) {
        pushStatusToast({ kind: 'error', message: res.error ?? 'Could not save product' });
        return;
      }
      const p = res.product;
      updateLine(line.key, {
        productId: p.id,
        sku: p.sku,
        description: p.name,
        unitPrice: line.unitPrice !== '' ? line.unitPrice : String(p.sellPrice),
        isManual: false,
        saveAsType: undefined,
      });
      onCatalogProduct?.({
        id: p.id,
        sku: p.sku,
        name: p.name,
        sellPrice: p.sellPrice,
        unitCost: p.unitCost,
        barcode: p.barcode,
        imageUrl: p.imageUrl,
      });
      pushStatusToast({
        kind: 'success',
        message: `Saved as ${p.productType} product ${p.sku}`,
      });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="doc-lines-card">
      <div className="doc-lines-head">
        <span>Line items</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>{hint}</span>
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
              <th style={{ minWidth: 150 }}>Save as product</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={line.key} className={line.isManual ? 'doc-line-manual' : undefined}>
                <td>
                  <input type="hidden" name={`line_${i}_productId`} value={line.productId} />
                  <span className={`doc-line-sku ${line.isManual ? 'is-manual' : ''}`}>
                    {line.isManual ? 'Manual' : line.sku || '—'}
                  </span>
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
                  <QtyStepper
                    name={`line_${i}_quantity`}
                    value={line.quantity}
                    onChange={(v) => updateLine(line.key, { quantity: v })}
                    min={0}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    name={`line_${i}_unitPrice`}
                    inputMode="decimal"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                    placeholder={line.isManual ? 'Set price' : undefined}
                  />
                </td>
                <td className="num">{money(amounts[i] ?? 0)}</td>
                <td>
                  {line.isManual && !line.productId ? (
                    <div className="doc-save-as-product">
                      <select
                        className="input doc-save-as-type"
                        value={line.saveAsType ?? 'service'}
                        onChange={(e) =>
                          updateLine(line.key, {
                            saveAsType: e.target.value as 'physical' | 'digital' | 'service',
                          })
                        }
                        aria-label="Product type"
                      >
                        <option value="service">Service</option>
                        <option value="physical">Physical</option>
                        <option value="digital">Digital</option>
                      </select>
                      <button
                        type="button"
                        className="button secondary doc-save-as-btn"
                        disabled={busyKey === line.key || !line.description.trim()}
                        onClick={() => saveAsProduct(line)}
                      >
                        {busyKey === line.key ? '…' : 'Save'}
                      </button>
                    </div>
                  ) : line.productId ? (
                    <span className="doc-line-linked" title="Linked catalog product">
                      Linked
                    </span>
                  ) : (
                    <span className="doc-line-linked muted">—</span>
                  )}
                </td>
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
                <td colSpan={7} style={{ color: 'var(--ink-soft)', fontSize: 13, padding: '10px 8px' }}>
                  No lines yet — search a product or type free text and press Enter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="product-add-row">
          <label className="product-add-label">Add product or free text</label>
          <ProductAddSearch
            products={products}
            onPick={pickProduct}
            onPickManual={pickManual}
            placeholder="Type SKU, name, or free-text description…"
            autoFocus
            onSearchActive={onSearchActive}
          />
        </div>
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
  );
}
