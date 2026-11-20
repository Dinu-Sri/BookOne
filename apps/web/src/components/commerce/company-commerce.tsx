'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormFooter, FormShell } from '@/components/ui/form-shell';
import { SelectField } from '@/components/ui/select-field';
import { SearchField, TextField } from '@/components/ui/text-field';
import { withFormPending } from '@/components/ui/form-busy';
import {
  applyCommerceMappingFromForm,
  createCommerceConnectionFromForm,
  issueCommerceCredentialFromForm,
  previewCommerceMappingFromForm,
  publishCommerceStockFromForm,
  retryCommerceReviewFromForm,
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

type MappingView = {
  id: string;
  sku: string;
  bookoneProductId: string;
  bookoneName: string | null;
  externalProductId: string;
  externalVariantId: string;
  status: string;
};

type ReviewView = {
  id: string;
  externalId: string;
  status: string;
  reviewReason: string | null;
  createdAt: string;
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
  mappings: MappingView[];
  reviews: ReviewView[];
  activity: Array<{ id: string; action: string; entity: string; createdAt: string }>;
};

const ACTION_LABELS: Record<string, string> = {
  'connection.create': 'Created connection',
  'connection.update': 'Updated connection',
  'credential.issue': 'Issued key',
  'credential.rotate': 'Rotated key',
  'credential.revoke': 'Revoked key',
  'mapping.apply': 'Applied mapping',
  'stock.publish': 'Published stock',
  'order.retry': 'Retried review order',
};

function kindLabel(kind: string) {
  return kind === 'woocommerce' ? 'WooCommerce' : 'Custom website';
}

function modeLabel(mode: string) {
  return mode === 'posting' ? 'Posting' : 'Preview';
}

function formatWhen(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Colombo',
  }).format(date);
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    /* clipboard may be denied */
  }
}

export function CompanyCommerce(props: {
  canWrite: boolean;
  saved: boolean;
  saveError: string | null;
  initialTab: Tab;
  initialConnectionId: string;
  apiBase: string;
  locations: Array<{ id: string; name: string }>;
  products: Array<{ id: string; sku: string; name: string }>;
  connections: ConnectionView[];
}) {
  const [tab, setTab] = useState<Tab>(props.initialTab);
  const [creating, setCreating] = useState(props.connections.length === 0);
  const [kind, setKind] = useState('woocommerce');
  const [environment, setEnvironment] = useState('sandbox');
  const [locationId, setLocationId] = useState('');
  const [selectedId, setSelectedId] = useState(props.initialConnectionId || props.connections[0]?.id || '');
  const [productId, setProductId] = useState('');
  const [sku, setSku] = useState('');
  const [mapQuery, setMapQuery] = useState('');
  const [activityQuery, setActivityQuery] = useState('');
  const [issued, setIssued] = useState<{
    token: string;
    prefix: string;
    previousExpiresAt?: string | null;
    rotatedFromPrefix?: string | null;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Array<{ sku: string; bookoneName: string | null; issue: string | null }>>([]);
  const [confirmPosting, setConfirmPosting] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [draftPosting, setDraftPosting] = useState<string | null>(null);
  const selected = useMemo(
    () => props.connections.find((c) => c.id === selectedId) ?? props.connections[0] ?? null,
    [props.connections, selectedId],
  );
  const postingMode = draftPosting ?? selected?.postingMode ?? 'preview';
  const selectedProduct = props.products.find((p) => p.id === productId);
  const locationName = props.locations.find((l) => l.id === selected?.locationId)?.name ?? 'Not chosen';

  function selectConnection(id: string) {
    setSelectedId(id);
    setCreating(false);
    setPreview([]);
    setActionError(null);
    setDraftPosting(null);
  }

  function pickProduct(id: string) {
    setProductId(id);
    const next = props.products.find((p) => p.id === id);
    setSku(next?.sku ?? '');
  }

  async function onIssue(formData: FormData) {
    setActionError(null);
    const result = await withFormPending(() => issueCommerceCredentialFromForm(formData));
    if (result.ok) setIssued({ token: result.token, prefix: result.prefix });
    else setActionError(result.error);
  }

  async function onRotate(formData: FormData) {
    setActionError(null);
    const result = await withFormPending(() => rotateCommerceCredentialFromForm(formData));
    if (result.ok) {
      setIssued({
        token: result.token,
        prefix: result.prefix,
        previousExpiresAt: result.previousExpiresAt,
        rotatedFromPrefix: result.rotatedFromPrefix,
      });
    } else setActionError(result.error);
  }

  async function onPreviewMapping(formData: FormData) {
    setActionError(null);
    const result = await withFormPending(() => previewCommerceMappingFromForm(formData));
    if (result.ok) setPreview(result.items);
    else setActionError(result.error);
  }

  const filteredMappings = (selected?.mappings ?? []).filter((row) => {
    const q = mapQuery.trim().toLowerCase();
    if (!q) return true;
    return [row.sku, row.bookoneName, row.externalProductId, row.externalVariantId, row.status]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
  const filteredActivity = (selected?.activity ?? []).filter((row) => {
    const q = activityQuery.trim().toLowerCase();
    if (!q) return true;
    return `${ACTION_LABELS[row.action] ?? row.action} ${row.entity}`.toLowerCase().includes(q);
  });

  return (
    <div className="workspace party-workspace commerce-workspace" style={{ display: 'grid', gap: 14 }}>
      <FormShell backHref="/company/details" backParent="Company" title="Commerce Integrations" size="wide">
        {props.saved ? <p className="field-help">Saved.</p> : null}
        {props.saveError ? (
          <p className="form-error" role="alert">
            {props.saveError}
          </p>
        ) : null}
        {actionError ? (
          <p className="form-error" role="alert">
            {actionError}
          </p>
        ) : null}

        {issued ? (
          <div className="commerce-issued" role="status">
            <p>
              Copy this key now. BookOne will not show it again. Prefix <strong>{issued.prefix}</strong>
            </p>
            {issued.previousExpiresAt ? (
              <p className="field-help">
                Previous key {issued.rotatedFromPrefix} stays valid until {formatWhen(issued.previousExpiresAt)}.
              </p>
            ) : null}
            <TextField id="issued-token" label="Commerce key" name="issuedToken" defaultValue={issued.token} readOnly />
            <Button type="button" onClick={() => void copyText(issued.token)}>
              Copy key
            </Button>
            <Button type="button" onClick={() => setIssued(null)}>
              I have copied this key
            </Button>
          </div>
        ) : null}

        {selected ? (
          <header className="commerce-connection-header">
            <div>
              <strong>{selected.name}</strong>
              <p className="field-help">
                {kindLabel(selected.kind)} · {selected.environment} · {selected.currency} · {locationName} ·{' '}
                {modeLabel(selected.postingMode)}
                {selected.inboundPaused ? ' · inbound paused' : ''}
                {selected.outboundPaused ? ' · outbound paused' : ''}
              </p>
            </div>
            {selected.reviewCount > 0 ? (
              <Button type="button" onClick={() => setTab('activity')}>
                {selected.reviewCount} need review
              </Button>
            ) : null}
          </header>
        ) : (
          <p className="field-help">Add a WooCommerce or Custom website sandbox first. Posting starts in Preview.</p>
        )}

        <div className="party-tabs" role="tablist">
          {(['connections', 'mapping', 'activity'] as Tab[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={tab === id ? 'party-tab active' : 'party-tab'}
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {id === 'connections' ? 'Connections' : id === 'mapping' ? 'Mapping' : 'Activity'}
            </button>
          ))}
        </div>

        {tab === 'connections' ? (
          <div className="party-tab-panel">
            <div className="commerce-connection-list">
              {props.connections.length === 0 ? (
                <p className="field-help">No commerce connections yet.</p>
              ) : (
                <ul className="commerce-store-list">
                  {props.connections.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className={row.id === selected?.id ? 'commerce-store-btn active' : 'commerce-store-btn'}
                        onClick={() => selectConnection(row.id)}
                      >
                        {row.name} · {kindLabel(row.kind)} · {modeLabel(row.postingMode)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {props.canWrite ? (
                <Button type="button" variant="primary" onClick={() => setCreating(true)}>
                  New connection
                </Button>
              ) : null}
            </div>

            {creating ? (
              <form action={props.canWrite ? createCommerceConnectionFromForm : undefined} className="party-tab-grid">
                <input type="hidden" name="tab" value="connections" />
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
                      { value: 'custom_website', label: 'Custom website' },
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
                    options={[
                      { value: '', label: 'Choose a stock location' },
                      ...props.locations.map((l) => ({ value: l.id, label: l.name })),
                    ]}
                    emptyReason="Add a company location first."
                    help="Choose the eligible stock location for this store. BookOne does not preselect one."
                  />
                  <TextField id="conn-currency" name="currency" label="Currency" defaultValue="LKR" />
                  <FormFooter>
                    <Button variant="primary" type="submit" disabled={!props.canWrite}>
                      Add connection
                    </Button>
                    {props.connections.length ? (
                      <Button type="button" onClick={() => setCreating(false)}>
                        Cancel
                      </Button>
                    ) : null}
                  </FormFooter>
                </fieldset>
              </form>
            ) : null}

            {selected ? (
              <div key={selected.id} className="party-tab-grid" style={{ marginTop: 12 }}>
                <div className="field-full">
                  <p>
                    API endpoint <code>{props.apiBase}</code>{' '}
                    <Button type="button" onClick={() => void copyText(props.apiBase)}>
                      Copy endpoint
                    </Button>
                  </p>
                  <p>
                    Connection ID <code>{selected.id}</code>{' '}
                    <Button type="button" onClick={() => void copyText(selected.id)}>
                      Copy connection ID
                    </Button>
                  </p>
                </div>

                <form action={props.canWrite ? updateCommerceConnectionFromForm : undefined}>
                  <input type="hidden" name="connectionId" value={selected.id} />
                  <input type="hidden" name="tab" value="connections" />
                  <SelectField
                    id={`posting-mode-${selected.id}`}
                    name="postingMode"
                    label="Posting"
                    value={postingMode}
                    onChange={(value) => {
                      if (value === 'posting' && selected.postingMode !== 'posting') {
                        setConfirmPosting(true);
                        return;
                      }
                      setDraftPosting(value);
                    }}
                    options={[
                      { value: 'preview', label: 'Preview' },
                      { value: 'posting', label: 'Post supported paid orders' },
                    ]}
                    help="Preview holds paid orders for review. Posting writes through the existing sales invoice path."
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

                <form action={props.canWrite ? onIssue : undefined}>
                  <input type="hidden" name="connectionId" value={selected.id} />
                  <input type="hidden" name="tab" value="connections" />
                  <p className="field-help">Keys are shown once in this dialog. They are never placed in the page URL.</p>
                  <Button variant="primary" type="submit" disabled={!props.canWrite}>
                    Issue scoped key
                  </Button>
                </form>

                <form action={testCommerceConnectionFromForm}>
                  <input type="hidden" name="connectionId" value={selected.id} />
                  <input type="hidden" name="tab" value="connections" />
                  <TextField
                    id={`test-token-${selected.id}`}
                    name="token"
                    label="Test a key (paste once)"
                    type="password"
                    autoComplete="new-password"
                    help="Tests that this key authenticates the selected store. It does not enable live posting."
                  />
                  <Button type="submit">Test connection</Button>
                </form>

                <ul>
                  {selected.credentials.map((cred) => (
                    <li key={cred.id}>
                      Prefix {cred.prefix} · {cred.status} · scopes {cred.scopes.join(', ')} · last used{' '}
                      {cred.lastUsedAt ? formatWhen(cred.lastUsedAt) : 'never'}
                      {cred.expiresAt && cred.status === 'rotated' ? ` · overlap until ${formatWhen(cred.expiresAt)}` : ''}
                      {props.canWrite && cred.status === 'active' ? (
                        <>
                          <form action={onRotate} style={{ display: 'inline' }}>
                            <input type="hidden" name="connectionId" value={selected.id} />
                            <input type="hidden" name="credentialId" value={cred.id} />
                            <input type="hidden" name="tab" value="connections" />
                            <Button type="submit">Rotate</Button>
                          </form>
                          <Button type="button" onClick={() => setRevokeId(cred.id)}>
                            Revoke
                          </Button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'mapping' ? (
          <div className="party-tab-panel">
            {!selected ? (
              <p className="field-help">Add a connection first.</p>
            ) : (
              <div key={`map-${selected.id}`}>
                {props.products.length === 0 ? (
                  <p className="field-help">Add a sellable BookOne product before mapping SKUs.</p>
                ) : null}
                <SearchField
                  id="map-search"
                  label="Search mappings"
                  value={mapQuery}
                  onChange={setMapQuery}
                  placeholder="SKU, BookOne name, store product"
                  showLabel
                />
                {filteredMappings.length ? (
                  <table className="commerce-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>BookOne</th>
                        <th>Store product</th>
                        <th>Variant</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMappings.map((row) => (
                        <tr key={row.id}>
                          <td>{row.sku}</td>
                          <td>{row.bookoneName ?? row.bookoneProductId}</td>
                          <td>{row.externalProductId}</td>
                          <td>{row.externalVariantId || '—'}</td>
                          <td>{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="field-help">No mappings yet for this store.</p>
                )}

                <form className="party-tab-grid">
                  <input type="hidden" name="connectionId" value={selected.id} />
                  <input type="hidden" name="tab" value="mapping" />
                  <fieldset disabled={!props.canWrite} style={{ border: 0, margin: 0, padding: 0 }}>
                    <SelectField
                      id={`map-product-${selected.id}`}
                      name="bookoneProductId"
                      label="BookOne product"
                      value={productId}
                      onChange={pickProduct}
                      options={[
                        { value: '', label: 'Choose a product' },
                        ...props.products.map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}` })),
                      ]}
                      emptyReason="Add a sellable product first."
                    />
                    <TextField
                      key={`sku-${productId}`}
                      id="map-sku"
                      name="sku"
                      label="SKU"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      help={selectedProduct ? `Derived from ${selectedProduct.name}. Recalculated when the product changes.` : undefined}
                    />
                    <TextField id="map-ext" name="externalProductId" label="Store product ID" required />
                    <TextField id="map-var" name="externalVariantId" label="Store variant ID" />
                    <FormFooter>
                      <Button type="submit" formAction={props.canWrite ? onPreviewMapping : undefined} disabled={!props.canWrite}>
                        Preview mapping
                      </Button>
                      <Button
                        variant="primary"
                        type="submit"
                        formAction={props.canWrite ? applyCommerceMappingFromForm : undefined}
                        disabled={!props.canWrite || preview.length === 0 || preview.some((row) => row.issue)}
                      >
                        Apply mapping
                      </Button>
                    </FormFooter>
                  </fieldset>
                </form>
                {preview.length ? (
                  <div>
                    <p>Preview result</p>
                    <ul>
                      {preview.map((row) => (
                        <li key={`${row.sku}-${row.bookoneName}`}>
                          {row.sku} · {row.bookoneName ?? 'Unknown product'}
                          {row.issue ? ` · ${row.issue}` : ' · ready to apply'}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="field-help">Preview the mapping before applying. Website listings stay intact.</p>
                )}
                <form action={props.canWrite ? publishCommerceStockFromForm : undefined}>
                  <input type="hidden" name="connectionId" value={selected.id} />
                  <input type="hidden" name="tab" value="mapping" />
                  <Button type="submit" disabled={!props.canWrite}>
                    Publish BookOne stock
                  </Button>
                </form>
                <p className="field-help">
                  Manual stock publication is separate from mapping. Only mapped SKUs receive absolute BookOne quantities.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {tab === 'activity' ? (
          <div className="party-tab-panel">
            {!selected ? (
              <p className="field-help">Add a connection first.</p>
            ) : (
              <div key={`act-${selected.id}`}>
                {selected.reviews.length ? (
                  <section>
                    <h2 className="commerce-section-title">Needs review</h2>
                    <ul>
                      {selected.reviews.map((row) => (
                        <li key={row.id}>
                          Order {row.externalId} · {row.reviewReason ?? 'Needs review'} · {formatWhen(row.createdAt)}
                          {props.canWrite ? (
                            <form action={retryCommerceReviewFromForm} style={{ display: 'inline' }}>
                              <input type="hidden" name="connectionId" value={selected.id} />
                              <input type="hidden" name="orderId" value={row.id} />
                              <input type="hidden" name="tab" value="activity" />
                              <Button type="submit">Retry posting</Button>
                            </form>
                          ) : null}
                          <span className="field-help"> Fix mapping on the Mapping tab if the SKU is unmapped.</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                <SearchField
                  id="activity-search"
                  label="Search activity"
                  value={activityQuery}
                  onChange={setActivityQuery}
                  placeholder="Status, action, store"
                  showLabel
                />
                {filteredActivity.length === 0 ? (
                  <p className="field-help">No commerce activity yet.</p>
                ) : (
                  <table className="commerce-table">
                    <thead>
                      <tr>
                        <th>When (Asia/Colombo)</th>
                        <th>Store</th>
                        <th>Action</th>
                        <th>Record</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredActivity.map((row) => (
                        <tr key={row.id}>
                          <td>{formatWhen(row.createdAt)}</td>
                          <td>{selected.name}</td>
                          <td>{ACTION_LABELS[row.action] ?? row.action}</td>
                          <td>{row.entity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ) : null}
      </FormShell>

      <ConfirmDialog
        open={confirmPosting}
        title="Enable posting?"
        message="Paid mapped orders will post BookOne sales invoices and move stock. Preview stays available if you leave this off."
        confirmLabel="Enable posting"
        tone="warning"
        onCancel={() => setConfirmPosting(false)}
        onConfirm={() => {
          if (!selected) return;
          const data = new FormData();
          data.set('connectionId', selected.id);
          data.set('tab', 'connections');
          data.set('postingMode', 'posting');
          if (selected.inboundPaused) data.set('inboundPaused', 'on');
          if (selected.outboundPaused) data.set('outboundPaused', 'on');
          setConfirmPosting(false);
          void withFormPending(() => updateCommerceConnectionFromForm(data));
        }}
      />
      <ConfirmDialog
        open={Boolean(revokeId)}
        title="Revoke this key?"
        message="The store will stop authenticating with this key immediately. Rotate first if you still need an overlap window."
        confirmLabel="Revoke key"
        tone="danger"
        onCancel={() => setRevokeId(null)}
        onConfirm={() => {
          if (!selected || !revokeId) return;
          const data = new FormData();
          data.set('connectionId', selected.id);
          data.set('credentialId', revokeId);
          data.set('tab', 'connections');
          setRevokeId(null);
          void withFormPending(() => revokeCommerceCredentialFromForm(data));
        }}
      />
    </div>
  );
}
