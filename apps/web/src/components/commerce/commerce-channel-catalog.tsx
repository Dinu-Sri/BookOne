'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { saveChannelSettingsFromForm, seedSampleCatalogFromForm, setChannelPublishingFromForm } from '@/app/actions/commerce';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { SelectField } from '@/components/ui/select-field';
import { SearchField, TextField } from '@/components/ui/text-field';

export type ChannelCatalogView = {
  products: Array<{
    id: string;
    sku: string;
    name: string;
    parentProductId: string | null;
    productType: string;
    categoryId: string | null;
    productBrandId: string | null;
    weightGrams: number | null;
    published: boolean;
    explicitlyPublished: boolean;
    linked: boolean;
  }>;
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  missingWeight: Array<{ id: string; sku: string; name: string }>;
  channel: { safetyBuffer: number; allowBackorder: boolean; timezone: string };
};

const PAGE = 25;

/** WP1 C1: choose which products this store may show and sell. */
export function CommerceChannelCatalog({
  connectionId,
  canWrite,
  data,
}: {
  connectionId: string;
  canWrite: boolean;
  data: ChannelCatalogView;
}) {
  const [query, setQuery] = useState('');
  const [show, setShow] = useState('all');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);

  // Variants are published with their parent listing, so list top-level products.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.products
      .filter((p) => !p.parentProductId)
      .filter((p) => (show === 'published' ? p.published : show === 'unpublished' ? !p.published : true))
      .filter((p) => !categoryId || p.categoryId === categoryId)
      .filter((p) => !brandId || p.productBrandId === brandId)
      .filter((p) => !q || `${p.sku} ${p.name}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.products, query, show, categoryId, brandId]);
  const variantCount = (id: string) => data.products.filter((p) => p.parentProductId === id).length;
  const publishedCount = data.products.filter((p) => !p.parentProductId && p.published).length;
  const allVisibleSelected = rows.slice(0, shown).every((r) => selected.has(r.id)) && rows.length > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="commerce-panel-stack">
      <section className="commerce-card">
        <h2 className="commerce-section-title">Products on this store</h2>
        <p className="field-help">
          Choose which products this website may show and sell. Only published products and their stock go to the website.
          Products linked to listings already on the website count as published, and publishing a product with colours or
          sizes publishes all of them.
        </p>
        <p className="commerce-badges">
          <Badge tone="info">{publishedCount} published</Badge>
          <Badge tone={data.missingWeight.length ? 'warning' : 'neutral'}>{data.missingWeight.length} missing weight</Badge>
        </p>
        {data.missingWeight.length ? (
          <details>
            <summary className="field-help">Published products with no weight (delivery needs it)</summary>
            <ul className="commerce-key-list">
              {data.missingWeight.slice(0, 50).map((p) => (
                <li key={p.id}>
                  <Link href={`/inventory/products/${p.id}/edit`}>
                    {p.sku} · {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="party-toolbar">
          <SearchField id={`chan-search-${connectionId}`} label="Search products" value={query} onChange={setQuery} placeholder="SKU or name" />
          <SelectField
            id={`chan-show-${connectionId}`}
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { value: 'all', label: 'All products' },
              { value: 'published', label: 'Published' },
              { value: 'unpublished', label: 'Not published' },
            ]}
          />
          <SelectField
            id={`chan-cat-${connectionId}`}
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            options={[{ value: '', label: 'All categories' }, ...data.categories.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <SelectField
            id={`chan-brand-${connectionId}`}
            label="Brand"
            value={brandId}
            onChange={setBrandId}
            options={[{ value: '', label: 'All brands' }, ...data.brands.map((b) => ({ value: b.id, label: b.name }))]}
          />
        </div>

        <form action={setChannelPublishingFromForm}>
          <input type="hidden" name="connectionId" value={connectionId} />
          <input type="hidden" name="tab" value="mapping" />
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="productId" value={id} />
          ))}
          <div className="commerce-table-scroll" tabIndex={0} role="region" aria-label="Products on this store">
            <table className="commerce-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all shown"
                      checked={allVisibleSelected}
                      disabled={!canWrite}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          const ids = rows.slice(0, shown).map((r) => r.id);
                          if (allVisibleSelected) ids.forEach((id) => next.delete(id));
                          else ids.forEach((id) => next.add(id));
                          return next;
                        })
                      }
                    />
                  </th>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Weight</th>
                  <th>On this store</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((p) => (
                  <tr key={p.id} className={selected.has(p.id) ? 'is-selected' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.sku}`}
                        checked={selected.has(p.id)}
                        disabled={!canWrite}
                        onChange={() => toggle(p.id)}
                      />
                    </td>
                    <td>{p.sku}</td>
                    <td>
                      {p.name}
                      {variantCount(p.id) ? <span className="field-help"> · {variantCount(p.id)} variants</span> : null}
                    </td>
                    <td>{p.weightGrams != null ? `${p.weightGrams} g` : variantCount(p.id) ? 'per variant' : '—'}</td>
                    <td>
                      {p.published ? (
                        <Badge tone="success">{p.linked && !p.explicitlyPublished ? 'Linked' : 'Published'}</Badge>
                      ) : (
                        <Badge>Not published</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > shown ? (
            <Button type="button" onClick={() => setShown((n) => n + PAGE)}>
              Show more ({rows.length - shown} left)
            </Button>
          ) : null}
          {canWrite ? (
            <div className="commerce-inline-actions" style={{ marginTop: 10 }}>
              <Button type="submit" name="publish" value="1" variant="primary" disabled={!selected.size}>
                Publish {selected.size || ''} selected
              </Button>
              <Button type="submit" name="publish" value="0" disabled={!selected.size}>
                Unpublish selected
              </Button>
            </div>
          ) : null}
        </form>
      </section>
    </div>
  );
}

/** WP1 C4: stock shown to the website (safety buffer, backorder) and timezone. */
export function CommerceChannelSettingsCard({
  connectionId,
  canWrite,
  channel,
}: {
  connectionId: string;
  canWrite: boolean;
  channel: ChannelCatalogView['channel'];
}) {
  return (
    <form action={saveChannelSettingsFromForm} className="commerce-card">
      <h2 className="commerce-section-title">Stock shown to the website</h2>
      <input type="hidden" name="connectionId" value={connectionId} />
      <input type="hidden" name="tab" value="settings" />
      <fieldset className="commerce-fields" disabled={!canWrite}>
        <TextField
          id={`chan-buffer-${connectionId}`}
          name="safetyBuffer"
          label="Safety buffer (units)"
          type="number"
          min={0}
          step={1}
          defaultValue={String(channel.safetyBuffer)}
          help="Keep this many units back from the website, for example 1 so the shop never sells the last item online."
        />
        <label className="party-check">
          <input type="checkbox" name="allowBackorder" defaultChecked={channel.allowBackorder} /> Let the website take orders when
          stock is 0 (backorders)
        </label>
        <TextField
          id={`chan-tz-${connectionId}`}
          name="timezone"
          label="Store timezone"
          defaultValue={channel.timezone}
          help="The time zone your website uses, e.g. Asia/Colombo."
        />
      </fieldset>
      {canWrite ? <Button type="submit">Save stock settings</Button> : null}
    </form>
  );
}

/** Sandbox only: add the sample catalog for website testing. */
export function SampleCatalogCard({ connectionId }: { connectionId: string }) {
  return (
    <form action={seedSampleCatalogFromForm} className="commerce-card">
      <h2 className="commerce-section-title">Sample catalog for testing</h2>
      <input type="hidden" name="connectionId" value={connectionId} />
      <input type="hidden" name="tab" value="developer" />
      <p className="field-help">
        Adds about 48 SAMPLE- products (3 brands, a category tree, paint ranges with 6 colour variants each, photos,
        weights and stock) and publishes them to this sandbox store, so your website can test a full catalog import.
        Stock is added at zero cost, so no journals are posted. Running it again adds nothing new.
      </p>
      <Button type="submit">Add sample catalog</Button>
    </form>
  );
}
