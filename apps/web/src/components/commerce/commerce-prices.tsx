'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  bulkPriceListFromForm,
  savePriceEntryFromForm,
  savePriceListFromForm,
  setChannelPriceListFromForm,
} from '@/app/actions/commerce';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DateField } from '@/components/ui/date-field';
import { withFormPending } from '@/components/ui/form-busy';
import { SelectField } from '@/components/ui/select-field';
import { SearchField, TextField } from '@/components/ui/text-field';

export type PricesView = {
  lists: Array<{ id: string; name: string; currency: string; customerGroup: string | null; itemCount: number }>;
  channelPriceListId: string | null;
  editListId: string | null;
  timezone: string;
  rows: Array<{
    productId: string;
    sku: string;
    name: string;
    basePrice: string;
    price: string | null;
    compareAtPrice: string | null;
    salePrice: string | null;
    saleStartsAt: string | null;
    saleEndsAt: string | null;
    tiers: Array<{ minQty: string; price: string }>;
    effective: string;
  }>;
};

const PAGE = 25;

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

function tiersText(t: PricesView['rows'][number]['tiers']): string {
  return t.map((x) => `${Number(x.minQty)}=${x.price}`).join('; ');
}

/** WP2: which price list this store sells at, the lists themselves, and per-product prices. */
export function CommercePrices({ connectionId, canWrite, data }: { connectionId: string; canWrite: boolean; data: PricesView }) {
  const router = useRouter();
  const [channelList, setChannelList] = useState(data.channelPriceListId ?? '');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [editing, setEditing] = useState<string | null>(null);
  const [saleFrom, setSaleFrom] = useState('');
  const [saleTo, setSaleTo] = useState('');
  const [archive, setArchive] = useState<{ id: string; name: string } | null>(null);
  const editList = data.lists.find((l) => l.id === data.editListId) ?? null;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.rows.filter((r) => !q || `${r.sku} ${r.name}`.toLowerCase().includes(q));
  }, [data.rows, query]);
  const current = data.rows.find((r) => r.productId === editing) ?? null;

  function openEditor(productId: string) {
    const r = data.rows.find((x) => x.productId === productId);
    setEditing(productId);
    setSaleFrom(day(r?.saleStartsAt ?? null));
    setSaleTo(day(r?.saleEndsAt ?? null));
  }

  return (
    <div className="commerce-panel-stack">
      <form action={setChannelPriceListFromForm} className="commerce-card">
        <h2 className="commerce-section-title">Prices on this store</h2>
        <input type="hidden" name="connectionId" value={connectionId} />
        <input type="hidden" name="tab" value="prices" />
        <p className="field-help">
          The website shows and charges the prices from this list. Products not on the list use their BookOne sell price.
          With no list, every product uses its sell price.
        </p>
        <SelectField
          id={`chan-price-list-${connectionId}`}
          name="channelPriceListId"
          label="Price list"
          value={channelList}
          onChange={setChannelList}
          disabled={!canWrite}
          options={[
            { value: '', label: 'BookOne sell price (no list)' },
            ...data.lists.map((l) => ({ value: l.id, label: l.customerGroup ? `${l.name} (${l.customerGroup})` : l.name })),
          ]}
        />
        {canWrite ? <Button type="submit">Use this price list</Button> : null}
      </form>

      <section className="commerce-card">
        <h2 className="commerce-section-title">Price lists</h2>
        <p className="field-help">
          Make a list per channel (e.g. Online Retail) or per customer group (wholesale, school, artist). A website can ask
          for a group&apos;s prices with <code>customerGroup=</code>.
        </p>
        {data.lists.length ? (
          <div className="commerce-table-scroll" tabIndex={0} role="region" aria-label="Price lists">
            <table className="commerce-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Customer group</th>
                  <th>Products priced</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.lists.map((l) => (
                  <tr key={l.id} className={l.id === data.editListId ? 'is-selected' : undefined}>
                    <td>
                      {l.name} {l.id === data.channelPriceListId ? <Badge tone="success">This store</Badge> : null}
                    </td>
                    <td>{l.customerGroup ?? '—'}</td>
                    <td>{l.itemCount}</td>
                    <td className="commerce-inline-actions">
                      <Button
                        type="button"
                        onClick={() => router.push(`/company/commerce?tab=prices&connection=${connectionId}&list=${l.id}`)}
                      >
                        Edit prices
                      </Button>
                      {canWrite ? (
                        <Button type="button" variant="ghost" onClick={() => setArchive({ id: l.id, name: l.name })}>
                          Archive
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="field-help">No price lists yet. The store sells at BookOne sell prices.</p>
        )}
        {canWrite ? (
          <form action={savePriceListFromForm} className="form-grid">
            <input type="hidden" name="connectionId" value={connectionId} />
            <input type="hidden" name="tab" value="prices" />
            <TextField id="pl-name" name="name" label="New price list" placeholder="Online Retail" required />
            <TextField id="pl-group" name="customerGroup" label="Customer group (optional)" placeholder="wholesale" />
            <div style={{ alignSelf: 'end' }}>
              <Button type="submit">Create price list</Button>
            </div>
          </form>
        ) : null}
      </section>

      {editList ? (
        <section className="commerce-card">
          <h2 className="commerce-section-title">Prices in {editList.name}</h2>
          <p className="field-help">
            Leave a price empty to use the BookOne sell price. A was price shows struck through when it is higher than the
            price. Sales start at the beginning of the first day and end at the end of the last day ({data.timezone}).
            Websites see changes within seconds.
          </p>
          {canWrite ? (
            <form action={bulkPriceListFromForm} className="form-grid">
              <input type="hidden" name="connectionId" value={connectionId} />
              <input type="hidden" name="priceListId" value={editList.id} />
              <input type="hidden" name="tab" value="prices" />
              <TextField
                id="pl-bulk"
                name="percent"
                label="Set every price from the sell price ±%"
                type="number"
                step="any"
                placeholder="-10"
                help="For example -10 for 10% below the sell price. Keeps was prices, sales and tiers."
              />
              <div className="commerce-inline-actions" style={{ alignSelf: 'end' }}>
                <Button type="submit">Apply to all</Button>
                <Button type="submit" name="clear" value="1" variant="ghost">
                  Clear all prices
                </Button>
              </div>
            </form>
          ) : null}
          <SearchField id="pl-search" label="Search products" value={query} onChange={setQuery} placeholder="SKU or name" />
          <div className="commerce-table-scroll" tabIndex={0} role="region" aria-label={`Prices in ${editList.name}`}>
            <table className="commerce-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Sell price</th>
                  <th>List price</th>
                  <th>Was</th>
                  <th>Sale</th>
                  <th>Tiers</th>
                  <th>Now</th>
                  {canWrite ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((r) => (
                  <tr key={r.productId} className={r.productId === editing ? 'is-selected' : undefined}>
                    <td>{r.sku}</td>
                    <td>{r.name}</td>
                    <td>{r.basePrice}</td>
                    <td>{r.price ?? '—'}</td>
                    <td>{r.compareAtPrice ?? '—'}</td>
                    <td>{r.salePrice ? `${r.salePrice} (${day(r.saleStartsAt) || '…'} → ${day(r.saleEndsAt) || '…'})` : '—'}</td>
                    <td>{tiersText(r.tiers) || '—'}</td>
                    <td>{r.effective}</td>
                    {canWrite ? (
                      <td>
                        <Button type="button" onClick={() => openEditor(r.productId)}>
                          Edit
                        </Button>
                      </td>
                    ) : null}
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
          {rows.length === 0 ? <p className="field-help">No published products. Publish products on the Products tab first.</p> : null}

          {canWrite && current ? (
            <form action={savePriceEntryFromForm} className="commerce-card" key={current.productId}>
              <h3 className="commerce-section-title">
                {current.sku} · {current.name}
              </h3>
              <input type="hidden" name="connectionId" value={connectionId} />
              <input type="hidden" name="priceListId" value={editList.id} />
              <input type="hidden" name="productId" value={current.productId} />
              <input type="hidden" name="timezone" value={data.timezone} />
              <input type="hidden" name="tab" value="prices" />
              <div className="form-grid">
                <TextField id="pe-price" name="price" label="List price" defaultValue={current.price ?? ''} placeholder={current.basePrice} help="Empty = sell price" />
                <TextField id="pe-was" name="compareAtPrice" label="Was price" defaultValue={current.compareAtPrice ?? ''} />
                <TextField id="pe-sale" name="salePrice" label="Sale price" defaultValue={current.salePrice ?? ''} />
                <DateField id="pe-from" name="saleFrom" label="Sale from" value={saleFrom} onChange={setSaleFrom} allowBlank />
                <DateField id="pe-to" name="saleTo" label="Sale to" value={saleTo} onChange={setSaleTo} allowBlank />
                <TextField id="pe-tiers" name="tiers" label="Quantity prices" defaultValue={tiersText(current.tiers)} placeholder="6=1050; 12=990" help="Unit price from a quantity" />
              </div>
              <div className="commerce-inline-actions">
                <Button type="submit" variant="primary">
                  Save price
                </Button>
                <Button type="button" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
        </section>
      ) : data.lists.length ? (
        <p className="field-help">Choose Edit prices on a list to change its prices.</p>
      ) : null}

      <ConfirmDialog
        open={Boolean(archive)}
        title={`Archive ${archive?.name ?? 'price list'}?`}
        message="Stores that sold at this list go back to BookOne sell prices."
        confirmLabel="Archive"
        tone="danger"
        onCancel={() => setArchive(null)}
        onConfirm={() => {
          if (!archive) return;
          const fd = new FormData();
          fd.set('priceListId', archive.id);
          fd.set('name', archive.name);
          fd.set('archive', '1');
          fd.set('connectionId', connectionId);
          fd.set('tab', 'prices');
          setArchive(null);
          void withFormPending(() => savePriceListFromForm(fd));
        }}
      />
    </div>
  );
}
