'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/bookone-ui';
import { FormFooter, FormShell } from '@/components/ui/form-shell';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import {
  applyCommerceMappingFromForm,
  createCommerceConnectionFromForm,
  issueCommerceCredentialFromForm,
  publishCommerceStockFromForm,
  revokeCommerceCredentialFromForm,
  rotateCommerceCredentialFromForm,
  testCommerceConnectionFromForm,
  updateCommerceConnectionFromForm,
} from '@/app/actions/commerce';

type Tab = 'connections' | 'mapping' | 'activity';

type CredentialView = {
  id: string;
  prefix: string;
  scopes: string[];
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  secret: string | null;
};

type ConnectionView = {
  id: string;
  name: string;
  kind: string;
  environment: string;
  postingMode: string;
  inboundPaused: boolean;
  outboundPaused: boolean;
  currency: string;
  locationId: string | null;
  mappingCount: number;
  reviewCount: number;
  lastCatalog: string | null;
  lastStock: string | null;
  lastOrder: string | null;
  credentials: CredentialView[];
  activity: Array<{ id: string; action: string; entity: string; createdAt: string }>;
};

export function CompanyCommerce(props: {
  canWrite: boolean;
  saved: boolean;
  saveError: string | null;
  issuedToken: string | null;
  issuedPrefix: string | null;
  apiBase: string;
  locations: Array<{ id: string; name: string }>;
  products: Array<{ id: string; sku: string; name: string }>;
  connections: ConnectionView[];
}) {
  const [tab, setTab] = useState<Tab>('connections');
  const [kind, setKind] = useState('woocommerce');
  const [environment, setEnvironment] = useState('sandbox');
  const [locationId, setLocationId] = useState(props.locations[0]?.id ?? '');
  const [selectedId, setSelectedId] = useState(props.connections[0]?.id ?? '');
  const [productId, setProductId] = useState(props.products[0]?.id ?? '');
  const [postingMode, setPostingMode] = useState(props.connections[0]?.postingMode ?? 'preview');
  const selected = useMemo(
    () => props.connections.find((c) => c.id === selectedId) ?? props.connections[0] ?? null,
    [props.connections, selectedId],
  );

  return (
    <div className="workspace party-workspace" style={{ display: 'grid', gap: 14 }}>
      <FormShell backHref="/company/details" backParent="Company" title="Commerce Integrations" size="wide">
        <p className="field-help">
          BookOne is the inventory authority. Storefront copy stays on the website. v1 is asynchronous stock with a
          review policy for oversells. Reservation mode is disabled. HTTP 2xx is not accounting acceptance.
        </p>
        {props.saved ? <p className="field-help">Saved.</p> : null}
        {props.saveError ? (
          <p className="form-error" role="alert">
            {props.saveError}
          </p>
        ) : null}
        {props.issuedToken ? (
          <div className="party-tab-panel" style={{ marginBottom: 12 }}>
            <p>
              Copy this key now. BookOne will not show it again. Prefix <strong>{props.issuedPrefix}</strong>
            </p>
            <TextField id="issued-token" label="Commerce key" name="issuedToken" defaultValue={props.issuedToken} readOnly />
          </div>
        ) : null}

        <div className="party-tabs" role="tablist">
          {(['connections', 'mapping', 'activity'] as Tab[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={tab === id ? 'party-tab is-active' : 'party-tab'}
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {id === 'connections' ? 'Connections' : id === 'mapping' ? 'Mapping' : 'Activity'}
            </button>
          ))}
        </div>

        {tab === 'connections' ? (
          <div className="party-tab-panel">
            {props.connections.length === 0 ? (
              <p className="field-help">No commerce connections yet. Add a WooCommerce or Custom Website sandbox first.</p>
            ) : (
              <SelectField
                id="selected-connection"
                label="Open connection"
                value={selected?.id ?? ''}
                onChange={setSelectedId}
                options={props.connections.map((c) => ({
                  value: c.id,
                  label: `${c.name} · ${c.kind} · ${c.environment}`,
                }))}
              />
            )}

            <form action={props.canWrite ? createCommerceConnectionFromForm : undefined} className="party-tab-grid">
              <fieldset disabled={!props.canWrite} style={{ border: 0, margin: 0, padding: 0 }}>
                <TextField id="conn-name" name="name" label="Connection name" required />
                <SelectField
                  id="conn-kind"
                  name="kind"
                  label="Kind"
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: 'woocommerce', label: 'WooCommerce' },
                    { value: 'custom_website', label: 'Custom Website' },
                  ]}
                />
                <SelectField
                  id="conn-env"
                  name="environment"
                  label="Environment"
                  value={environment}
                  onChange={setEnvironment}
                  options={[
                    { value: 'sandbox', label: 'Sandbox' },
                    { value: 'live', label: 'Live' },
                  ]}
                />
                <SelectField
                  id="conn-location"
                  name="locationId"
                  label="Stock location"
                  value={locationId}
                  onChange={setLocationId}
                  options={
                    props.locations.length
                      ? props.locations.map((l) => ({ value: l.id, label: l.name }))
                      : [{ value: '', label: 'No locations yet', disabled: true }]
                  }
                  emptyReason="Add a company location first."
                />
                <TextField id="conn-currency" name="currency" label="Currency" defaultValue="LKR" />
                <FormFooter>
                  <Button variant="primary" type="submit" disabled={!props.canWrite}>
                    Add connection
                  </Button>
                </FormFooter>
              </fieldset>
            </form>

            {selected ? (
              <div className="party-tab-grid" style={{ marginTop: 18 }}>
                <p>
                  API base <code>{props.apiBase}</code>. Connection ID <code>{selected.id}</code>. Posting starts in
                  preview until mappings are checked.
                </p>
                <form action={props.canWrite ? updateCommerceConnectionFromForm : undefined}>
                  <input type="hidden" name="connectionId" value={selected.id} />
                  <SelectField
                    id="posting-mode"
                    name="postingMode"
                    label="Posting"
                    value={postingMode}
                    onChange={setPostingMode}
                    options={[
                      { value: 'preview', label: 'Preview / staging' },
                      { value: 'posting', label: 'Post supported paid orders' },
                    ]}
                  />
                  <label className="party-check">
                    <input type="checkbox" name="inboundPaused" defaultChecked={selected.inboundPaused} /> Pause inbound
                    orders
                  </label>
                  <label className="party-check">
                    <input type="checkbox" name="outboundPaused" defaultChecked={selected.outboundPaused} /> Pause outbound
                    stock
                  </label>
                  <Button type="submit" disabled={!props.canWrite}>
                    Save pauses and posting
                  </Button>
                </form>
                <form action={props.canWrite ? issueCommerceCredentialFromForm : undefined}>
                  <input type="hidden" name="connectionId" value={selected.id} />
                  <Button variant="primary" type="submit" disabled={!props.canWrite}>
                    Issue scoped key
                  </Button>
                </form>
                <form action={testCommerceConnectionFromForm}>
                  <TextField id="test-token" name="token" label="Test a key (paste once)" />
                  <Button type="submit">Test connection</Button>
                </form>
                <ul>
                  {selected.credentials.map((cred) => (
                    <li key={cred.id}>
                      Prefix {cred.prefix} · {cred.status} · scopes {cred.scopes.join(', ')} · last used{' '}
                      {cred.lastUsedAt ?? 'never'}
                      {props.canWrite && cred.status === 'active' ? (
                        <>
                          <form action={rotateCommerceCredentialFromForm} style={{ display: 'inline' }}>
                            <input type="hidden" name="connectionId" value={selected.id} />
                            <input type="hidden" name="credentialId" value={cred.id} />
                            <Button type="submit">Rotate</Button>
                          </form>
                          <form action={revokeCommerceCredentialFromForm} style={{ display: 'inline' }}>
                            <input type="hidden" name="connectionId" value={selected.id} />
                            <input type="hidden" name="credentialId" value={cred.id} />
                            <Button type="submit">Revoke</Button>
                          </form>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="field-help">
                  Review queue: {selected.reviewCount}. Mapped products: {selected.mappingCount}. Last order{' '}
                  {selected.lastOrder ?? '—'}.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'mapping' ? (
          <div className="party-tab-panel">
            {!selected ? (
              <p className="field-help">Add a connection first.</p>
            ) : (
              <>
                <form action={props.canWrite ? applyCommerceMappingFromForm : undefined} className="party-tab-grid">
                  <fieldset disabled={!props.canWrite} style={{ border: 0, margin: 0, padding: 0 }}>
                    <input type="hidden" name="connectionId" value={selected.id} />
                    <SelectField
                      id="map-product"
                      name="bookoneProductId"
                      label="BookOne product"
                      value={productId}
                      onChange={setProductId}
                      options={props.products.map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}` }))}
                      emptyReason="Add a sellable product first."
                    />
                    <TextField
                      id="map-sku"
                      name="sku"
                      label="SKU"
                      defaultValue={props.products.find((p) => p.id === productId)?.sku ?? ''}
                    />
                    <TextField id="map-ext" name="externalProductId" label="Store product ID" required />
                    <TextField id="map-var" name="externalVariantId" label="Store variant ID" />
                    <FormFooter>
                      <Button variant="primary" type="submit">
                        Preview and apply mapping
                      </Button>
                    </FormFooter>
                  </fieldset>
                </form>
                <form action={props.canWrite ? publishCommerceStockFromForm : undefined}>
                  <input type="hidden" name="connectionId" value={selected.id} />
                  <Button type="submit" disabled={!props.canWrite}>
                    Publish BookOne stock
                  </Button>
                </form>
                <p className="field-help">
                  Website listings stay intact. Only mapped SKUs receive absolute BookOne quantities. Woo native stock
                  for mapped products is overwritten by this feed; BookOne does not subtract Woo native reductions a
                  second time.
                </p>
              </>
            )}
          </div>
        ) : null}

        {tab === 'activity' ? (
          <div className="party-tab-panel">
            {!selected ? (
              <p className="field-help">Add a connection first.</p>
            ) : selected.activity.length === 0 ? (
              <p className="field-help">No commerce activity yet.</p>
            ) : (
              <ul>
                {selected.activity.map((row) => (
                  <li key={row.id}>
                    {row.createdAt.replace('T', ' ').slice(0, 16)} · {row.action} · {row.entity}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </FormShell>
    </div>
  );
}
