'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createProductFromForm, updateProductFromForm, type ProductRow } from '@/app/actions/inventory';
import { Button } from '@/components/ui/bookone-ui';

const TABS = [
  { id: 'identity', label: 'Identity' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'stock', label: 'Stock' },
  { id: 'notes', label: 'Notes' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function ProductForm({
  mode,
  product,
}: {
  mode: 'create' | 'edit';
  product?: ProductRow | null;
}) {
  const action = mode === 'edit' ? updateProductFromForm : createProductFromForm;
  const [tab, setTab] = useState<TabId>('identity');
  const [productType, setProductType] = useState(product?.productType ?? 'physical');
  const [preview, setPreview] = useState<string | null>(product?.imageUrl ?? null);
  const isPhysical = productType === 'physical' || productType === 'stocked';
  const typeLocked = Boolean(product?.typeLocked);

  return (
    <div className="party-form-shell">
      <div className="party-form-top">
        <Link href="/inventory/products" className="party-back-btn">
          <span className="party-back-arrow" aria-hidden>
            ←
          </span>
          <span>
            <strong>Back to list</strong>
            <small>Products</small>
          </span>
        </Link>
        <div className="party-tabs" role="tablist">
          {TABS.map((t) => {
            if (t.id === 'stock' && !isPhysical) return null;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                className={`party-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <form action={action} className="party-form-body" encType="multipart/form-data">
        {mode === 'edit' && product ? <input type="hidden" name="id" value={product.id} /> : null}

        <div className="party-tab-panel" hidden={tab !== 'identity'}>
          <div className="party-tab-grid">
            <div className="field field-full">
              <label>Product photo</label>
              <div className="product-photo-row">
                <div className="product-photo-preview">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="Product preview" width={96} height={96} />
                  ) : (
                    <span>400×400</span>
                  )}
                </div>
                <div className="product-photo-meta">
                  <input
                    className="input"
                    type="file"
                    name="photo"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) {
                        setPreview(product?.imageUrl ?? null);
                        return;
                      }
                      const url = URL.createObjectURL(file);
                      setPreview(url);
                    }}
                  />
                  <p className="product-photo-hint">
                    Any photo is auto-converted to <strong>400×400 WebP</strong> and compressed. Original is not kept.
                  </p>
                </div>
              </div>
            </div>
            <div className="field">
              <label>Product type *</label>
              <select
                className="input"
                name="productType"
                value={productType}
                disabled={typeLocked}
                onChange={(e) => setProductType(e.target.value)}
              >
                <option value="physical">Physical (stocked goods)</option>
                <option value="digital">Digital (non-stock)</option>
                <option value="service">Service</option>
              </select>
              {typeLocked ? (
                <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                  Type locked after stock movements or document usage.
                </p>
              ) : null}
              {typeLocked ? <input type="hidden" name="productType" value={productType} /> : null}
            </div>
            <div className="field">
              <label>SKU *</label>
              <input className="input" name="sku" required defaultValue={product?.sku ?? ''} />
            </div>
            <div className="field field-full">
              <label>Name *</label>
              <input className="input" name="name" required defaultValue={product?.name ?? ''} />
            </div>
            <div className="field">
              <label>Unit</label>
              <input className="input" name="unit" defaultValue={product?.unit ?? 'ea'} />
            </div>
            <div className="field">
              <label>Category</label>
              <input className="input" name="category" defaultValue={product?.category ?? ''} />
            </div>
            <div className="field">
              <label>Barcode</label>
              <input className="input" name="barcode" defaultValue={product?.barcode ?? ''} />
            </div>
            <div className="field">
              <label>Tax status</label>
              <select className="input" name="taxStatus" defaultValue={product?.taxStatus ?? 'unknown'}>
                <option value="unknown">Unknown</option>
                <option value="standard">Standard</option>
                <option value="exempt">Exempt</option>
              </select>
            </div>
            <div className="party-role-row">
              <label className="party-check">
                <input type="checkbox" name="sellable" value="on" defaultChecked={product?.sellable ?? true} />
                Sellable
              </label>
              <label className="party-check">
                <input type="checkbox" name="purchasable" value="on" defaultChecked={product?.purchasable ?? true} />
                Purchasable
              </label>
            </div>
            <div className="field field-full">
              <label>Description</label>
              <input className="input" name="description" defaultValue={product?.description ?? ''} />
            </div>
          </div>
        </div>

        <div className="party-tab-panel" hidden={tab !== 'pricing'}>
          <div className="party-tab-grid">
            <div className="field">
              <label>{isPhysical ? 'Unit cost *' : 'Cost (optional)'}</label>
              <input className="input" name="unitCost" inputMode="decimal" defaultValue={product?.unitCost ?? 0} />
            </div>
            <div className="field">
              <label>Sell price *</label>
              <input className="input" name="sellPrice" inputMode="decimal" defaultValue={product?.sellPrice ?? 0} />
            </div>
          </div>
        </div>

        <div className="party-tab-panel" hidden={tab !== 'accounts'}>
          <div className="party-tab-grid">
            <div className="field">
              <label>Revenue account</label>
              <input className="input" name="revenueAccountCode" defaultValue={product?.revenueAccountCode ?? '4000'} />
            </div>
            {isPhysical ? (
              <>
                <div className="field">
                  <label>COGS account</label>
                  <input className="input" name="cogsAccountCode" defaultValue={product?.cogsAccountCode ?? '5000'} />
                </div>
                <div className="field">
                  <label>Inventory account</label>
                  <input
                    className="input"
                    name="inventoryAccountCode"
                    defaultValue={product?.inventoryAccountCode ?? '5100'}
                  />
                </div>
              </>
            ) : (
              <div className="field">
                <label>Expense / cost account</label>
                <input className="input" name="expenseAccountCode" defaultValue={product?.expenseAccountCode ?? '6800'} />
              </div>
            )}
          </div>
        </div>

        {isPhysical ? (
          <div className="party-tab-panel" hidden={tab !== 'stock'}>
            <div className="party-tab-grid">
              {mode === 'create' ? (
                <div className="field">
                  <label>Opening qty</label>
                  <input className="input" name="openingQty" inputMode="decimal" defaultValue="0" />
                </div>
              ) : (
                <input type="hidden" name="openingQty" value="0" />
              )}
              <div className="field">
                <label>Reorder level</label>
                <input className="input" name="reorderLevel" inputMode="decimal" defaultValue={product?.reorderLevel ?? ''} />
              </div>
              <div className="field">
                <label>Reorder qty</label>
                <input className="input" name="reorderQty" inputMode="decimal" defaultValue={product?.reorderQty ?? ''} />
              </div>
              {mode === 'edit' ? (
                <div className="field">
                  <label>Qty on hand</label>
                  <input className="input" value={product?.qtyOnHand ?? 0} readOnly />
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <input type="hidden" name="openingQty" value="0" />
        )}

        <div className="party-tab-panel" hidden={tab !== 'notes'}>
          <div className="party-tab-grid">
            <div className="field">
              <label>Status</label>
              <select className="input" name="status" defaultValue={product?.isActive === '0' ? 'inactive' : 'active'}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="field field-full">
              <label>Notes</label>
              <input className="input" name="notes" defaultValue={product?.notes ?? ''} />
            </div>
          </div>
        </div>

        <div className="party-form-footer">
          <Link href="/inventory/products">
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </Link>
          <Button variant="primary" type="submit">
            {mode === 'edit' ? 'Save changes' : 'Save product'}
          </Button>
        </div>
      </form>
    </div>
  );
}
