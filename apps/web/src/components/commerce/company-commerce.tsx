'use client';

import { useMemo, useState } from 'react';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormFooter, FormShell } from '@/components/ui/form-shell';
import { SelectField } from '@/components/ui/select-field';
import { SearchField, TextField } from '@/components/ui/text-field';
import { withFormPending } from '@/components/ui/form-busy';
import { LOCATION_TYPE_LABELS, isFleetLocationType } from '@/lib/rental-locations';
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
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'connections', label: 'Connections' },
  { id: 'mapping', label: 'Mapping' },
  { id: 'activity', label: 'Activity' },
];

const SCOPE_OPTIONS = [
  { value: 'catalog', label: 'Catalog', help: 'Read BookOne products.' },
  { value: 'inventory', label: 'Inventory', help: 'Read and publish stock.' },
  { value: 'order', label: 'Orders', help: 'Submit paid store orders.' },
  { value: 'lifecycle', label: 'Lifecycle', help: 'Paid, cancelled, fulfilled and refund events.' },
] as const;

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
  if (!value) return 'Not yet reported';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Colombo',
  }).format(date);
}

function mappingSignature(data: FormData) {
  return JSON.stringify(
    ['connectionId', 'bookoneProductId', 'sku', 'externalProductId', 'externalVariantId'].map(
      (name) => String(data.get(name) ?? ''),
    ),
  );
}

function locationReason(locationType: string) {
  const label = LOCATION_TYPE_LABELS[locationType] ?? locationType;
  if (isFleetLocationType(locationType)) {
    return `${label} is a rental fleet bay. Online store stock uses a shop or warehouse.`;
  }
  return label;
}

export function CompanyCommerce(props: {
  canWrite: boolean;
  saved: boolean;
  saveError: string | null;
  initialTab: Tab;
  initialConnectionId: string;
  apiBase: string;
  locations: Array<{ id: string; name: string; locationType: string }>;
  products: Array<{ id: string; sku: string; name: string }>;
  connections: ConnectionView[];
}) {
  const [tab, setTab] = useState<Tab>(props.initialTab);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState('woocommerce');
  const [environment, setEnvironment] = useState('sandbox');
  const [locationId, setLocationId] = useState('');
  const [selectedId, setSelectedId] = useState(props.initialConnectionId || props.connections[0]?.id || '');
  const [productId, setProductId] = useState('');
  const [sku, setSku] = useState('');
  const [externalProductId, setExternalProductId] = useState('');
  const [externalVariantId, setExternalVariantId] = useState('');
  const [mapQuery, setMapQuery] = useState('');
  const [activityQuery, setActivityQuery] = useState('');
  const [issued, setIssued] = useState<{
    token: string;
    prefix: string;
    previousExpiresAt?: string | null;
    rotatedFromPrefix?: string | null;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [mappingPreview, setMappingPreview] = useState<{
    signature: string;
    items: Array<{ sku: string; bookoneName: string | null; issue: string | null }>;
  } | null>(null);
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
  const signature = JSON.stringify([selected?.id ?? '', productId, sku, externalProductId, externalVariantId]);
  const preview = mappingPreview?.signature === signature ? mappingPreview.items : [];
  const empty = props.connections.length === 0;

  function openCreate() {
    setCreating(true);
    setTab('connections');
    setActionError(null);
  }

  function selectConnection(id: string) {
    setSelectedId(id);
    setCreating(false);
    setMappingPreview(null);
    setProductId('');
    setSku('');
    setExternalProductId('');
    setExternalVariantId('');
    setMapQuery('');
    setActivityQuery('');
    setCopyFeedback('');
    setIssued(null);
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
    setMappingPreview(null);
    const result = await withFormPending(() => previewCommerceMappingFromForm(formData));
    if (result.ok) setMappingPreview({ signature: mappingSignature(formData), items: result.items });
    else setActionError(result.error);
  }

  async function onApplyMapping(formData: FormData) {
    if (mappingSignature(formData) !== mappingPreview?.signature || !preview.length || preview.some((row) => row.issue)) {
      setActionError('Preview the current mapping before applying it.');
      return;
    }
    setActionError(null);
    await withFormPending(() => applyCommerceMappingFromForm(formData));
    setMappingPreview(null);
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback(`${label} copied.`);
    } catch {
      setCopyFeedback(`Could not copy ${label.toLowerCase()}. Select the value and copy it manually.`);
    }
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
    return `${ACTION_LABELS[row.action] ?? row.action} ${row.entity} ${selected?.name ?? ''}`.toLowerCase().includes(q);
  });

  const hasActiveKey = Boolean(selected?.credentials.some((c) => c.status === 'active'));
  const keyUsed = Boolean(selected?.credentials.some((c) => c.lastUsedAt));
  const mapped = (selected?.mappingCount ?? 0) > 0;

  return (
    <div className="workspace party-workspace commerce-workspace">
      <FormShell backHref="/company/details" backParent="Company" size="wide">
        <header className="commerce-page-head">
          <h1 className="commerce-page-title">Commerce Integrations</h1>
          <p className="commerce-page-lead">
            Connect your website so BookOne can share stock levels and receive orders.
          </p>
        </header>
        {props.saved ? <p className="form-success" role="status">Changes saved.</p> : null}
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
          <ConfirmDialog
            open
            title="Copy your Commerce key"
            confirmLabel="I have copied this key"
            cancelLabel="Close"
            tone="primary"
            onConfirm={() => {
              setIssued(null);
              setCopyFeedback('');
            }}
            onCancel={() => {
              setIssued(null);
              setCopyFeedback('');
            }}
          >
            <p>
              Copy this key now. BookOne will not show it again. Prefix <strong>{issued.prefix}</strong>
            </p>
            {selected?.kind === 'woocommerce' ? (
              <p className="field-help">
                Paste it into the BookOne Commerce WooCommerce plugin. Issuing a key does not mean the store is connected.
              </p>
            ) : (
              <p className="field-help">
                Store this key on your website server. Never put it in a theme file. Issuing a key does not mean the store is connected.
              </p>
            )}
            {issued.previousExpiresAt ? (
              <p className="field-help">
                Previous key {issued.rotatedFromPrefix} stays valid until {formatWhen(issued.previousExpiresAt)}.
              </p>
            ) : null}
            <TextField id="issued-token" label="Commerce key" name="issuedToken" defaultValue={issued.token} readOnly />
            <Button type="button" onClick={() => void copyText(issued.token, 'Key')}>
              Copy key
            </Button>
            <p className="field-help" role="status">
              {copyFeedback}
            </p>
          </ConfirmDialog>
        ) : null}

        <div className="party-tabs" role="tablist">
          {TABS.map(({ id, label }, index) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`commerce-tab-${id}`}
              aria-controls={`commerce-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              className={tab === id ? 'party-tab active' : 'party-tab'}
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              onKeyDown={(event) => {
                const nextIndex =
                  event.key === 'ArrowRight'
                    ? (index + 1) % TABS.length
                    : event.key === 'ArrowLeft'
                      ? (index + TABS.length - 1) % TABS.length
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? TABS.length - 1
                          : null;
                if (nextIndex === null) return;
                event.preventDefault();
                const next = TABS[nextIndex].id;
                setTab(next);
                document.getElementById(`commerce-tab-${next}`)?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'connections' ? (
          <div
            className="party-tab-panel"
            role="tabpanel"
            id="commerce-panel-connections"
            aria-labelledby="commerce-tab-connections"
          >
            {empty && !creating ? (
              <section className="commerce-first-card">
                <h2 className="commerce-section-title">Connect your first store</h2>
                <ol className="commerce-steps">
                  <li>
                    <strong>Create a connection</strong>
                    <span>Name the store, choose WooCommerce or a custom website, and pick a stock location.</span>
                  </li>
                  <li>
                    <strong>Connect your website</strong>
                    <span>Issue a key once and paste it in the plugin or your server. Then test it.</span>
                  </li>
                  <li>
                    <strong>Map products and test sync</strong>
                    <span>Match SKUs, preview, apply, then publish BookOne stock.</span>
                  </li>
                </ol>
                {props.canWrite ? (
                  <Button type="button" variant="primary" onClick={openCreate}>
                    New connection
                  </Button>
                ) : (
                  <p className="field-help">Ask an owner to add a store. You can view connections after they exist.</p>
                )}
              </section>
            ) : null}

            {creating ? (
              <form action={createCommerceConnectionFromForm} className="commerce-setup-form">
                <input type="hidden" name="tab" value="connections" />
                <fieldset className="commerce-fields">
                  <legend className="commerce-section-title">Create a connection</legend>
                  <div className="field-full">
                    <TextField id="conn-name" name="name" label="Connection name" required />
                  </div>
                  <SelectField
                    id="conn-kind"
                    name="kind"
                    label="Platform"
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
                    help="Start in sandbox. Live is for a real store after mapping and a paid last-unit check."
                  />
                  <SelectField
                    id="conn-location"
                    name="locationId"
                    label="Stock location"
                    value={locationId}
                    onChange={setLocationId}
                    options={[
                      { value: '', label: 'Choose a stock location' },
                      ...props.locations.map((l) => ({
                        value: l.id,
                        label: l.name,
                        disabled: isFleetLocationType(l.locationType),
                        description: locationReason(l.locationType),
                      })),
                    ]}
                    emptyReason="Add a company location first."
                    help="Choose a shop or warehouse. BookOne does not preselect one."
                  />
                  <SelectField
                    id="conn-currency"
                    name="currency"
                    label="Currency"
                    value="LKR"
                    onChange={() => undefined}
                    options={[{ value: 'LKR', label: 'LKR' }]}
                    help="This company posts store orders in LKR."
                  />
                  <FormFooter>
                    <Button type="button" onClick={() => setCreating(false)}>
                      Cancel
                    </Button>
                    <Button variant="primary" type="submit" disabled={!props.canWrite}>
                      Create connection
                    </Button>
                  </FormFooter>
                </fieldset>
              </form>
            ) : null}

            {!empty ? (
              <div className="commerce-store-layout">
                <div className="commerce-connection-list">
                  <ul className="commerce-store-list">
                    {props.connections.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          className={row.id === selected?.id ? 'commerce-store-btn active' : 'commerce-store-btn'}
                          aria-pressed={row.id === selected?.id}
                          onClick={() => selectConnection(row.id)}
                        >
                          {row.name}
                          <span className="field-help">
                            {kindLabel(row.kind)} · {row.environment} · {modeLabel(row.postingMode)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {props.canWrite && !creating ? (
                    <Button type="button" onClick={openCreate}>
                      New connection
                    </Button>
                  ) : null}
                </div>

                {selected ? (
                  <div key={selected.id} className="commerce-store-main">
                    <header className="commerce-connection-header">
                      <div>
                        <strong>{selected.name}</strong>
                        <p className="commerce-badges">
                          <Badge>{kindLabel(selected.kind)}</Badge>
                          <Badge>{selected.environment === 'live' ? 'Live' : 'Sandbox'}</Badge>
                          <Badge tone={selected.postingMode === 'posting' ? 'success' : 'neutral'}>
                            {selected.postingMode === 'posting' ? 'Posting' : 'Preview'}
                          </Badge>
                        </p>
                        <p className="field-help">
                          {locationName} · {selected.currency}
                          {selected.inboundPaused ? ' · inbound paused' : ''}
                          {selected.outboundPaused ? ' · outbound paused' : ''}
                        </p>
                      </div>
                      <p className="commerce-header-counts">
                        <Button type="button" onClick={() => setTab('mapping')}>
                          {selected.mappingCount} mapped
                        </Button>
                        <Button type="button" onClick={() => setTab('activity')}>
                          {selected.reviewCount} need review
                        </Button>
                      </p>
                    </header>
                    <p className="field-help">
                      Preview means incoming orders are reviewed before they are posted.
                    </p>

                    <ol className="commerce-steps">
                      <li className="is-done">
                        <strong>Create a connection</strong>
                        <span>Verified: this store is saved in BookOne.</span>
                      </li>
                      <li className={keyUsed ? 'is-done' : 'is-current'}>
                        <strong>Connect your website</strong>
                        {keyUsed ? (
                          <span>Verified: a key has authenticated this store.</span>
                        ) : hasActiveKey ? (
                          <span>
                            Next: paste the key in {selected.kind === 'woocommerce' ? 'the WooCommerce plugin' : 'your website server'} and
                            use Test connection. Issuing a key is not a successful connection.
                          </span>
                        ) : (
                          <span>
                            Next: issue a scoped key, then paste it in{' '}
                            {selected.kind === 'woocommerce'
                              ? 'WooCommerce (BookOne Commerce plugin 1.1.0)'
                              : 'your server-side client'}
                            .
                          </span>
                        )}
                      </li>
                      <li className={mapped && selected.lastStock ? 'is-done' : keyUsed ? 'is-current' : ''}>
                        <strong>Map products and test sync</strong>
                        {mapped && selected.lastStock ? (
                          <span>Verified: mapped SKUs have a BookOne stock publication.</span>
                        ) : mapped ? (
                          <span>Next: publish BookOne stock. Website listings stay intact until you publish.</span>
                        ) : (
                          <span>Next: open Mapping, preview a SKU, then apply it.</span>
                        )}
                      </li>
                    </ol>

                    <dl className="commerce-sync-facts">
                      <div>
                        <dt>BookOne stock publication</dt>
                        <dd>{formatWhen(selected.lastStock)}</dd>
                      </div>
                      <div>
                        <dt>Orders received</dt>
                        <dd>{formatWhen(selected.lastOrder)}</dd>
                      </div>
                      <div>
                        <dt>Catalog read</dt>
                        <dd>{formatWhen(selected.lastCatalog)}</dd>
                      </div>
                    </dl>

                    <div className="commerce-split">
                      <section className="commerce-card">
                        <h2 className="commerce-section-title">API credentials</h2>
                        <p className="field-help">
                          Keys are shown once. They never appear in the page URL. Rotation keeps the current scopes.
                        </p>
                        <div className="commerce-endpoints">
                          <p>
                            API endpoint <code>{props.apiBase}</code>{' '}
                            <Button type="button" onClick={() => void copyText(props.apiBase, 'Endpoint')}>
                              Copy endpoint
                            </Button>
                          </p>
                          <p>
                            Connection ID <code>{selected.id}</code>{' '}
                            <Button type="button" onClick={() => void copyText(selected.id, 'Connection ID')}>
                              Copy connection ID
                            </Button>
                          </p>
                          <p className="field-help" role="status">
                            {issued ? '' : copyFeedback}
                          </p>
                        </div>
                        {selected.kind === 'woocommerce' ? (
                          <p className="field-help">
                            Install `bookone-commerce-1.1.0.zip`, turn HPOS on, then paste the endpoint and sandbox key.
                          </p>
                        ) : (
                          <p className="field-help">
                            Call this endpoint from your server with `Authorization: Bearer` and an Idempotency-Key on
                            orders.
                          </p>
                        )}
                        <form action={props.canWrite ? onIssue : undefined}>
                          <input type="hidden" name="connectionId" value={selected.id} />
                          <input type="hidden" name="tab" value="connections" />
                          <fieldset className="commerce-scope-list">
                            <legend>Scopes for a new key</legend>
                            {SCOPE_OPTIONS.map((scope) => (
                              <label key={scope.value} className="party-check">
                                <input type="checkbox" name="scope" value={scope.value} defaultChecked /> {scope.label}
                                <span className="field-help">{scope.help}</span>
                              </label>
                            ))}
                          </fieldset>
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
                            help="Confirms this key authenticates the selected store. It does not enable live posting."
                          />
                          <Button type="submit">Test connection</Button>
                        </form>
                        <ul className="commerce-key-list">
                          {selected.credentials.length === 0 ? <li>No API keys have been issued.</li> : null}
                          {selected.credentials.map((cred) => (
                            <li key={cred.id}>
                              Prefix {cred.prefix} · {cred.status} · {cred.scopes.join(', ')} · last used{' '}
                              {cred.lastUsedAt ? formatWhen(cred.lastUsedAt) : 'never'}
                              {cred.expiresAt && cred.status === 'rotated'
                                ? ` · overlap until ${formatWhen(cred.expiresAt)}`
                                : ''}
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
                      </section>

                      <form action={updateCommerceConnectionFromForm} className="commerce-card">
                        <h2 className="commerce-section-title">Posting controls</h2>
                        <input type="hidden" name="connectionId" value={selected.id} />
                        <input type="hidden" name="tab" value="connections" />
                        <SelectField
                          id={`posting-mode-${selected.id}`}
                          name="postingMode"
                          disabled={!props.canWrite}
                          label="Incoming orders"
                          value={postingMode}
                          onChange={(value) => {
                            if (value === 'posting' && selected.postingMode !== 'posting') {
                              setConfirmPosting(true);
                              return;
                            }
                            setDraftPosting(value);
                          }}
                          options={[
                            { value: 'preview', label: 'Preview — review incoming orders before they are posted' },
                            { value: 'posting', label: 'Post supported paid orders' },
                          ]}
                          help="Choosing posting prepares the setting. Save applies it with the pause checkboxes."
                        />
                        <label className="party-check">
                          <input
                            type="checkbox"
                            name="inboundPaused"
                            disabled={!props.canWrite}
                            defaultChecked={selected.inboundPaused}
                          />{' '}
                          Pause inbound orders
                        </label>
                        <label className="party-check">
                          <input
                            type="checkbox"
                            name="outboundPaused"
                            disabled={!props.canWrite}
                            defaultChecked={selected.outboundPaused}
                          />{' '}
                          Pause outbound stock
                        </label>
                        <Button type="submit" disabled={!props.canWrite}>
                          Save pauses and posting
                        </Button>
                      </form>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'mapping' ? (
          <div className="party-tab-panel" role="tabpanel" id="commerce-panel-mapping" aria-labelledby="commerce-tab-mapping">
            {!selected ? (
              <section className="commerce-empty-panel">
                <p className="field-help">
                  {props.canWrite
                    ? 'Add a store first. Mapping matches BookOne products to website SKUs.'
                    : 'No store is connected yet. Mapping appears after an owner adds one.'}
                </p>
                {props.canWrite ? (
                  <Button type="button" variant="primary" onClick={openCreate}>
                    New connection
                  </Button>
                ) : null}
              </section>
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
                  <div className="commerce-table-scroll" tabIndex={0} role="region" aria-label="Product mappings">
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
                  </div>
                ) : (
                  <p className="field-help">
                    {mapQuery.trim() && selected.mappings.length
                      ? 'No mappings match your search.'
                      : props.products.length === 0
                        ? 'The BookOne catalog is empty.'
                        : 'Nothing mapped yet for this store.'}
                  </p>
                )}

                {props.canWrite && props.products.length > 0 ? (
                  <form action={onPreviewMapping} className="commerce-setup-form">
                    <input type="hidden" name="connectionId" value={selected.id} />
                    <input type="hidden" name="tab" value="mapping" />
                    <fieldset className="commerce-fields">
                      <legend className="commerce-section-title">Add a product mapping</legend>
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
                        help={
                          selectedProduct
                            ? `Derived from ${selectedProduct.name}. Recalculated when the product changes.`
                            : undefined
                        }
                      />
                      <TextField
                        id="map-ext"
                        name="externalProductId"
                        label="Store product ID"
                        value={externalProductId}
                        onChange={(event) => setExternalProductId(event.target.value)}
                        required
                      />
                      <TextField
                        id="map-var"
                        name="externalVariantId"
                        label="Store variant ID"
                        value={externalVariantId}
                        onChange={(event) => setExternalVariantId(event.target.value)}
                      />
                      <FormFooter>
                        <Button type="submit" disabled={!productId}>
                          Preview mapping
                        </Button>
                        <Button
                          variant="primary"
                          type="submit"
                          formAction={onApplyMapping}
                          disabled={!props.canWrite || preview.length === 0 || preview.some((row) => row.issue)}
                        >
                          Apply mapping
                        </Button>
                      </FormFooter>
                    </fieldset>
                  </form>
                ) : null}
                {preview.length ? (
                  <div className="commerce-card" role="status">
                    <h2 className="commerce-section-title">Mapping preview</h2>
                    <ul>
                      {preview.map((row) => (
                        <li key={`${row.sku}-${row.bookoneName}`}>
                          {row.sku} · {row.bookoneName ?? 'Unknown product'}
                          {row.issue ? ` · ${row.issue}` : ' · ready to apply'}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : props.canWrite && props.products.length > 0 ? (
                  <p className="field-help">Preview is the primary action until the current fields are reviewed.</p>
                ) : null}
                <form action={props.canWrite ? publishCommerceStockFromForm : undefined}>
                  <input type="hidden" name="connectionId" value={selected.id} />
                  <input type="hidden" name="tab" value="mapping" />
                  <Button type="submit" disabled={!props.canWrite || selected.mappingCount === 0 || selected.outboundPaused}>
                    Publish BookOne stock
                  </Button>
                </form>
                <p className="field-help">
                  BookOne stock publication is separate from a store acknowledgment. Only mapped SKUs receive absolute
                  BookOne quantities.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {tab === 'activity' ? (
          <div className="party-tab-panel" role="tabpanel" id="commerce-panel-activity" aria-labelledby="commerce-tab-activity">
            {!selected ? (
              <section className="commerce-empty-panel">
                <p className="field-help">
                  {props.canWrite
                    ? 'Activity lists review items and store events after a connection exists.'
                    : 'No store activity yet. An owner can add a connection first.'}
                </p>
                {props.canWrite ? (
                  <Button type="button" variant="primary" onClick={openCreate}>
                    New connection
                  </Button>
                ) : null}
              </section>
            ) : (
              <div key={`act-${selected.id}`}>
                {selected.reviews.length ? (
                  <section className="commerce-card">
                    <h2 className="commerce-section-title">Needs review</h2>
                    <ul className="commerce-key-list">
                      {selected.reviews.map((row) => (
                        <li key={row.id}>
                          Order {row.externalId} · {row.status} · {row.reviewReason ?? 'Needs review'} ·{' '}
                          {formatWhen(row.createdAt)}
                          {props.canWrite ? (
                            <form action={retryCommerceReviewFromForm} style={{ display: 'inline' }}>
                              <input type="hidden" name="connectionId" value={selected.id} />
                              <input type="hidden" name="orderId" value={row.id} />
                              <input type="hidden" name="tab" value="activity" />
                              <Button type="submit">Retry posting</Button>
                            </form>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : (
                  <p className="field-help">No orders are waiting for review.</p>
                )}
                <SearchField
                  id="activity-search"
                  label="Search activity"
                  value={activityQuery}
                  onChange={setActivityQuery}
                  placeholder="Action, record or store"
                  showLabel
                />
                {filteredActivity.length === 0 ? (
                  <p className="field-help">
                    {activityQuery.trim() && selected.activity.length
                      ? 'No activity matches your search.'
                      : 'No commerce activity yet.'}
                  </p>
                ) : (
                  <div className="commerce-table-scroll" tabIndex={0} role="region" aria-label="Commerce activity">
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
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </FormShell>

      <ConfirmDialog
        open={confirmPosting}
        title="Change the posting mode?"
        message="When you save this setting, supported paid orders can create BookOne sales invoices and move stock."
        confirmLabel="Use posting mode"
        tone="warning"
        onCancel={() => setConfirmPosting(false)}
        onConfirm={() => {
          setDraftPosting('posting');
          setConfirmPosting(false);
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
