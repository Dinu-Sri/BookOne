'use client';

import Link from 'next/link';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { createProductFromForm, updateProductFromForm, type ProductRow } from '@/app/actions/inventory';
import { createProductCategory, type ProductCategoryRow } from '@/app/actions/product-categories';
import { Button } from '@/components/ui/bookone-ui';
import { RichTextEditor, RichTextPopup } from '@/components/ui/rich-text-editor';
import { categoryOptionLabel } from '@/lib/product-category-display';
import { normalizeProductUnit, productUnitOptions } from '@/lib/product-units';

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
  categories = [],
  brands = [],
  locations = [],
}: {
  mode: 'create' | 'edit';
  product?: ProductRow | null;
  rentalCatalog?: { id: string; sku: string; name: string }[];
  categories?: ProductCategoryRow[];
  brands?: { id: string; name: string }[];
  locations?: { id: string; name: string; brandId?: string | null }[];
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
  const [categoryList, setCategoryList] = useState(categories);
  const [categoryId, setCategoryId] = useState(
    product?.categoryId ?? categories.find((c) => c.name === product?.category)?.id ?? '',
  );
  const [brandId, setBrandId] = useState(product?.brandId ?? (brands.length === 1 ? brands[0]!.id : ''));
  const defaultOpeningLocation = locations.length === 1 ? locations[0]!.id : '';
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryParentId, setCategoryParentId] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [shortHtml, setShortHtml] = useState(product?.description ?? '');
  const [longHtml, setLongHtml] = useState(product?.longDescription ?? '');
  const [textPopup, setTextPopup] = useState<'short' | 'long' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const unitOptions = productUnitOptions(product?.unit);
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

  async function saveNewCategory() {
    setCategoryBusy(true);
    setCategoryError('');
    try {
      const result = await createProductCategory(categoryName, { parentId: categoryParentId || null });
      if (!result.ok || !result.name || !result.id) {
        setCategoryError(result.error ?? 'Could not save category.');
        return;
      }
      const parent = categoryList.find((r) => r.id === categoryParentId);
      setCategoryList((rows) =>
        rows.some((r) => r.id === result.id)
          ? rows
          : [
              ...rows,
              {
                id: result.id,
                name: result.name!,
                slug: null,
                parentId: categoryParentId || null,
                parentName: parent?.name ?? null,
                brandId: null,
                brandName: null,
                locationId: null,
                locationName: null,
                productCount: 0,
                childCount: 0,
              },
            ],
      );
      setCategoryId(result.id);
      setCategoryName('');
      setCategoryParentId('');
      setCategoryOpen(false);
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : 'Could not save category.');
    } finally {
      setCategoryBusy(false);
    }
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
              <label>Sold as</label>
              <select className="input" name="unit" defaultValue={normalizeProductUnit(product?.unit ?? 'each')}>
                {unitOptions.map((unit) => (
                  <option value={unit.value} key={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
              <p className="party-hint">How you count this item when selling or buying.</p>
            </div>
            <div className="field">
              <label>Category</label>
              <div className="cluster" style={{ gap: 8 }}>
                <select
                  className="input"
                  name="categoryId"
                  value={categoryId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCategoryId(next);
                    const cat = categoryList.find((r) => r.id === next);
                    if (cat?.brandId && !brandId) setBrandId(cat.brandId);
                  }}
                  style={{ flex: 1 }}
                >
                  <option value="">No category</option>
                  {categoryList.map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.parentId ? '— ' : ''}
                      {categoryOptionLabel(row)}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" type="button" onClick={() => setCategoryOpen(true)}>
                  <Plus size={15} />
                  New
                </Button>
              </div>
              <p className="party-hint">
                Group products for POS and lists.{' '}
                <Link href="/inventory/categories" style={{ fontWeight: 700 }}>
                  Manage categories
                </Link>
              </p>
            </div>
            <div className="field">
              <label>Brand</label>
              <select className="input" name="brandId" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                <option value="">All brands (shared)</option>
                {brands.map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <p className="party-hint">
                {brands.length
                  ? 'Which company brand this SKU belongs to. Shared items stay on All brands.'
                  : 'Add brands under Company → Brands to tag products.'}
              </p>
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
            <RichTextEditor
              label="Short description"
              hint="One or two lines for lists, POS, and later a website product card."
              name="description"
              value={shortHtml}
              onChange={setShortHtml}
              compact
              placeholder="A short summary customers will see first."
              onOpenPopup={() => setTextPopup('short')}
            />
            <RichTextEditor
              label="Long description"
              hint="Full details, features, and care notes. Later this can sync to a website product page."
              name="longDescription"
              value={longHtml}
              onChange={setLongHtml}
              compact
              placeholder="Full product story, packing list, or specs."
              onOpenPopup={() => setTextPopup('long')}
            />
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
                <div className="field field-full">
                  <label className="party-check">
                    <input
                      type="checkbox"
                      name="tracksSerials"
                      value="on"
                      defaultChecked={product?.tracksSerials}
                    />
                    Track serial numbers (tents, generators — not bulk chairs)
                  </label>
                </div>
                <div className="field field-full">
                  <label>Serial codes (one per line)</label>
                  <textarea
                    className="input"
                    name="serialCodes"
                    rows={4}
                    defaultValue={(product?.serialCodes ?? []).join('\n')}
                    placeholder="PG-5X5-01"
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
                <>
                  <div className="field">
                    <label>Opening qty</label>
                    <input className="input" name="openingQty" inputMode="decimal" defaultValue="0" />
                  </div>
                  <div className="field">
                    <label>Opening location</label>
                    <select className="input" name="openingLocationId" defaultValue={defaultOpeningLocation}>
                      {locations.length === 0 ? (
                        <option value="">Unassigned (no locations set up)</option>
                      ) : (
                        <>
                          <option value="">Unassigned</option>
                          {locations.map((l) => (
                            <option value={l.id} key={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                    <p className="party-hint">
                      {locations.length
                        ? 'Required when opening qty is more than 0. Move stock later with a transfer.'
                        : 'Add locations under Company → Locations to put opening stock in a shop.'}
                    </p>
                  </div>
                </>
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
                <>
                  <div className="field">
                    <label>Qty on hand</label>
                    <input className="input" value={product?.qtyOnHand ?? 0} readOnly />
                  </div>
                  <div className="field field-full">
                    <label>Stock by location</label>
                    {product?.stockByLocation?.length ? (
                      <ul className="muted-line" style={{ display: 'grid', gap: 4, margin: 0, paddingLeft: 18 }}>
                        {product.stockByLocation.map((s) => (
                          <li key={s.locationId ?? 'unassigned'}>
                            {s.locationName}: {s.qty}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted-line">No stock rows yet.</p>
                    )}
                  </div>
                  {product?.openLots?.length ? (
                    <div className="field field-full">
                      <label>Cost lots (oldest sold first when FIFO is on)</label>
                      <ul className="muted-line" style={{ display: 'grid', gap: 4, margin: 0, paddingLeft: 18 }}>
                        {product.openLots.map((lot) => (
                          <li key={lot.id}>
                            {lot.receivedOn}: {lot.qtyRemaining} @ {lot.unitCost}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {product?.stockByLocation?.some((s) => !s.locationId && Math.abs(s.qty) > 0.0001) && locations.length ? (
                    <div className="field">
                      <label>Move unassigned stock to</label>
                      <select className="input" name="assignLocationId" defaultValue="">
                        <option value="">Leave unassigned</option>
                        {locations.map((l) => (
                          <option value={l.id} key={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </>
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

      {categoryOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setCategoryOpen(false)}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-category-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="new-category-title" className="modal-title">
              New category
            </h2>
            <p className="modal-message">
              Give this group a name people will recognise. Optional parent makes it a child category (WordPress-style).
            </p>
            <div className="field">
              <label>Category name</label>
              <input
                className="input"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g. Garden furniture"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Parent category</label>
              <select
                className="input"
                value={categoryParentId}
                onChange={(e) => setCategoryParentId(e.target.value)}
              >
                <option value="">None — this is a parent</option>
                {categoryList
                  .filter((row) => !row.parentId)
                  .map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
            </div>
            {categoryError ? <p className="form-error inline">{categoryError}</p> : null}
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={() => setCategoryOpen(false)} disabled={categoryBusy}>
                Cancel
              </Button>
              <Button variant="primary" type="button" onClick={saveNewCategory} disabled={categoryBusy}>
                {categoryBusy ? 'Saving…' : 'Save category'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <RichTextPopup
        open={textPopup === 'short'}
        title="Short description"
        hint="Keep this brief. It is the website-style short description."
        value={shortHtml}
        onCancel={() => setTextPopup(null)}
        onSave={(html) => {
          setShortHtml(html);
          setTextPopup(null);
        }}
      />
      <RichTextPopup
        open={textPopup === 'long'}
        title="Long description"
        hint="Full product page text. Formatting is saved as HTML for a later website sync."
        value={longHtml}
        onCancel={() => setTextPopup(null)}
        onSave={(html) => {
          setLongHtml(html);
          setTextPopup(null);
        }}
      />
    </div>
  );
}
