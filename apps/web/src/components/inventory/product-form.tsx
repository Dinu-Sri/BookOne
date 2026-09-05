'use client';

import Link from 'next/link';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { createProductFromForm, updateProductFromForm, type ProductRow } from '@/app/actions/inventory';
import { Button } from '@/components/ui/bookone-ui';

const TABS = [
  { id: 'identity', label: 'Identity' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'stock', label: 'Stock' },
  { id: 'kit', label: 'Kit' },
  { id: 'notes', label: 'Notes' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function ProductForm({
  mode,
  product,
  rentalCatalog = [],
}: {
  mode: 'create' | 'edit';
  product?: ProductRow | null;
  rentalCatalog?: { id: string; sku: string; name: string }[];
}) {
  const action = mode === 'edit' ? updateProductFromForm : createProductFromForm;
  const [tab, setTab] = useState<TabId>('identity');
  const [productType, setProductType] = useState(product?.productType ?? 'physical');
  const [preview, setPreview] = useState<string | null>(product?.imageUrl ?? null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [kitRows, setKitRows] = useState<{ productId: string; qty: string }[]>(
    (product?.kitComponents ?? []).map((c) => ({ productId: c.productId, qty: String(c.qty) })),
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const isPhysical = productType === 'physical' || productType === 'stocked';
  const isRental = productType === 'rental';
  const tracksQty = isPhysical || isRental;
  const typeLocked = Boolean(product?.typeLocked);

  function applyFile(file: File | null | undefined) {
    if (!file) {
      setPreview(product?.imageUrl ?? null);
      setFileName(null);
      return;
    }
    if (!file.type.startsWith('image/')) return;
    setFileName(file.name);
    setPreview(URL.createObjectURL(file));
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !fileRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    fileRef.current.files = dt.files;
    applyFile(file);
  }

  function clearPhoto() {
    if (fileRef.current) fileRef.current.value = '';
    setPreview(product?.imageUrl ?? null);
    setFileName(null);
  }

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
            if (t.id === 'stock' && !tracksQty) return null;
            if (t.id === 'kit' && !isRental) return null;
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

      <form action={action} className="party-form-body">
        {mode === 'edit' && product ? <input type="hidden" name="id" value={product.id} /> : null}

        <div className="party-tab-panel" hidden={tab !== 'identity'}>
          <div className="party-tab-grid">
            <div className="field field-full">
              <label>Product photo</label>
              <div
                className={`product-dropzone ${dragging ? 'is-dragging' : ''} ${preview ? 'has-preview' : ''}`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragging(false);
                }}
                onDrop={onDrop}
              >
                <div className="product-dropzone-preview">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="Product preview" width={112} height={112} />
                  ) : (
                    <div className="product-dropzone-empty">
                      <ImagePlus size={28} strokeWidth={1.75} />
                    </div>
                  )}
                </div>
                <div className="product-dropzone-body">
                  <strong>{preview ? 'Photo ready' : 'Add a product photo'}</strong>
                  <p>
                    Drag & drop, or choose a file. Saved as <b>400×400 WebP</b> (compressed). Original is discarded.
                  </p>
                  {fileName ? <span className="product-dropzone-file">{fileName}</span> : null}
                  <div className="product-dropzone-actions">
                    <button type="button" className="button secondary" onClick={() => fileRef.current?.click()}>
                      {preview ? 'Change photo' : 'Choose photo'}
                    </button>
                    {preview ? (
                      <button type="button" className="button ghost" onClick={clearPhoto}>
                        <Trash2 size={15} /> Remove
                      </button>
                    ) : null}
                  </div>
                </div>
                <input
                  ref={fileRef}
                  className="product-dropzone-input"
                  type="file"
                  name="photo"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => applyFile(e.target.files?.[0])}
                />
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
                <option value="rental">Rental (hire fleet — comes back)</option>
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
              <label>{isRental ? 'Hire rate *' : 'Sell price *'}</label>
              <input className="input" name="sellPrice" inputMode="decimal" defaultValue={product?.sellPrice ?? 0} />
            </div>
            {isRental ? (
              <>
                <div className="field">
                  <label>Hire unit</label>
                  <select className="input" name="hireUnit" defaultValue={product?.hireUnit ?? 'event'}>
                    <option value="event">Per event</option>
                    <option value="day">Per day</option>
                    <option value="hour">Per hour</option>
                  </select>
                </div>
                <div className="field">
                  <label>Turnaround hours</label>
                  <input
                    className="input"
                    name="turnaroundHours"
                    inputMode="numeric"
                    defaultValue={product?.turnaroundHours ?? ''}
                    placeholder="Tenant default"
                  />
                </div>
                <div className="field">
                  <label>Item deposit</label>
                  <input
                    className="input"
                    name="depositAmount"
                    inputMode="decimal"
                    defaultValue={product?.depositAmount ?? ''}
                  />
                </div>
                <div className="field">
                  <label>Replacement price</label>
                  <input
                    className="input"
                    name="replacementPrice"
                    inputMode="decimal"
                    defaultValue={product?.replacementPrice ?? ''}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="party-tab-panel" hidden={tab !== 'accounts'}>
          <div className="party-tab-grid">
            <div className="field">
              <label>Revenue account</label>
              <input
                className="input"
                name="revenueAccountCode"
                defaultValue={product?.revenueAccountCode ?? (isRental ? '4400' : '4000')}
              />
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
            ) : isRental ? (
              <div className="field">
                <label>Fleet inventory account</label>
                <input
                  className="input"
                  name="inventoryAccountCode"
                  defaultValue={product?.inventoryAccountCode ?? '5100'}
                />
              </div>
            ) : (
              <div className="field">
                <label>Expense / cost account</label>
                <input className="input" name="expenseAccountCode" defaultValue={product?.expenseAccountCode ?? '6800'} />
              </div>
            )}
          </div>
        </div>

        {tracksQty ? (
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

        {isRental ? (
          <div className="party-tab-panel" hidden={tab !== 'kit'}>
            <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '0 0 12px' }}>
              Optional. Adding this SKU on a quote or invoice explodes into these fleet items (qty × kit
              qty).
            </p>
            {kitRows.map((row, i) => (
              <div key={i} className="cluster" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <select
                  className="input"
                  name="kitComponentId"
                  value={row.productId}
                  onChange={(e) =>
                    setKitRows((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, productId: e.target.value } : r)),
                    )
                  }
                  style={{ minWidth: 240 }}
                >
                  <option value="">Component SKU</option>
                  {rentalCatalog
                    .filter((p) => p.id !== product?.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                </select>
                <input
                  className="input"
                  name="kitComponentQty"
                  inputMode="decimal"
                  value={row.qty}
                  onChange={(e) =>
                    setKitRows((rows) => rows.map((r, j) => (j === i ? { ...r, qty: e.target.value } : r)))
                  }
                  style={{ width: 100 }}
                  aria-label="Kit component qty"
                />
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setKitRows((rows) => rows.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              type="button"
              onClick={() => setKitRows((rows) => [...rows, { productId: '', qty: '1' }])}
            >
              Add component
            </Button>
          </div>
        ) : null}

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
