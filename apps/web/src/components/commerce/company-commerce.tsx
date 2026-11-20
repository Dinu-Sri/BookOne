'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormFooter, FormShell } from '@/components/ui/form-shell';
import { SelectField } from '@/components/ui/select-field';
import { SearchField, TextField } from '@/components/ui/text-field';
import { withFormPending } from '@/components/ui/form-busy';
import { LOCATION_TYPE_LABELS, isFleetLocationType } from '@/lib/rental-locations';
import {
  applyCommerceMappingFromForm,
  applyCommerceMappingProposalFromForm,
  createCommerceConnectionFromForm,
  issueCommerceCredentialFromForm,
  previewCommerceMappingFromForm,
  previewCommercePublishFromForm,
  publishCommerceStockFromForm,
  queueCommercePublishFromForm,
  rejectCommerceMappingProposalFromForm,
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
  proposals: Array<{
    id: string;
    status: string;
    origin: string;
    items: Array<{ sku: string; kind: string; reason: string; bookoneName: string | null; origin: string }>;
  }>;
  publishClaims: Array<{ id: string; sku: string; status: string; issue: string | null }>;
};

const ACTION_LABELS: Record<string, string> = {
  'connection.create': 'Created connection',
  'connection.update': 'Updated connection',
  'credential.issue': 'Issued key',
  'credential.rotate': 'Rotated key',
  'credential.revoke': 'Revoked key',
  'mapping.apply': 'Applied mapping',
  'mapping.propose': 'Proposed mapping',
  'mapping.reject': 'Rejected mapping proposal',
  'catalog.queue': 'Queued BookOne-first publish',
  'stock.publish': 'Published stock',
  'order.retry': 'Retried review order',
};

const ENTITY_LABELS: Record<string, string> = {
  inventory: 'Stock',
  credential: 'API key',
  connection: 'Store',
  mapping: 'Product mapping',
  order: 'Order',
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
  publishedCount: number | null;
  productsError: string | null;
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
  const [publishPreview, setPublishPreview] = useState<
    Array<{ bookoneProductId: string; sku: string; name: string | null; kind: string; reason: string }>
  >([]);
  const [confirmPosting, setConfirmPosting] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [draftPosting, setDraftPosting] = useState<string | null>(null);
  const [locationDraft, setLocationDraft] = useState<string | null>(null);
  const selected = useMemo(
    () => props.connections.find((c) => c.id === selectedId) ?? props.connections[0] ?? null,
    [props.connections, selectedId],
  );
  const postingMode = draftPosting ?? selected?.postingMode ?? 'preview';
  const selectedProduct = props.products.find((p) => p.id === productId);
  const selectedLocation = props.locations.find((l) => l.id === (locationDraft ?? selected?.locationId ?? ''));
  const locationName = selectedLocation?.name ?? 'Not chosen';
  const fleetLocation = Boolean(selectedLocation && isFleetLocationType(selectedLocation.locationType));
  const signature = JSON.stringify([selected?.id ?? '', productId, sku, externalProductId, externalVariantId]);
  const preview = mappingPreview?.signature === signature ? mappingPreview.items : [];
  const empty = props.connections.length === 0;
  const mappingReturn = `/company/commerce?tab=mapping${selected ? `&connection=${selected.id}` : ''}`;

  function syncUrl(nextTab: Tab, nextId: string) {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    params.set('tab', nextTab);
    if (nextId) params.set('connection', nextId);
    window.history.replaceState(null, '', `/company/commerce?${params}`);
  }

  function changeTab(next: Tab) {
    setTab(next);
    syncUrl(next, selected?.id ?? selectedId);
  }

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
    setLocationDraft(null);
    syncUrl(tab, id);
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
  const stockPublished = mapped && Boolean(selected?.lastStock);

  const nextAction = (() => {
    if (!selected) return null;
    if (fleetLocation) {
      return {
        title: 'Choose a shop or warehouse',
        detail: `${locationName} cannot hold online store stock. Save a branch or warehouse on this store.`,
        tab: 'connections' as Tab,
        label: null,
      };
    }
    if (!hasActiveKey) {
      return {
        title: 'Connect your website',
        detail:
          selected.kind === 'woocommerce'
            ? 'Issue a scoped key, install bookone-commerce-1.2.0.zip with HPOS on, and paste the key in the plugin. An issued key is only a key.'
            : 'Issue a scoped key and store it on your website server with Authorization: Bearer. An issued key is only a key.',
        tab: 'connections' as Tab,
        label: null,
      };
    }
    if (!keyUsed) {
      return {
        title: 'Test the key',
        detail: 'Paste the key once and use Test connection. A successful test proves authentication, not catalog or stock sync.',
        tab: 'connections' as Tab,
        label: null,
      };
    }
    if (!mapped) {
      return {
        title: 'Map products and test sync',
        detail: 'Match a BookOne SKU, preview, then apply. Website listings stay intact until you publish stock.',
        tab: 'mapping' as Tab,
        label: 'Open Mapping',
      };
    }
    if (!stockPublished) {
      return {
        title: 'Publish BookOne stock',
        detail: `Publish absolute BookOne quantities for mapped SKUs at ${locationName}. A publish with no mappings is not a successful publication.`,
        tab: 'mapping' as Tab,
        label: 'Open Mapping',
      };
    }
    return {
      title: 'Verify stock and orders',
      detail:
        'A paid last-unit order proves intake. Posted invoices can still show amount due until a payment account is configured. HTTP 2xx is not cash settlement.',
      tab: 'activity' as Tab,
      label: 'Open Activity',
    };
  })();

  function tabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
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
    changeTab(next);
    document.getElementById(`commerce-tab-${next}`)?.focus();
  }

  return (
    <div className="workspace party-workspace commerce-workspace">
      <FormShell backHref="/company/details" backParent="Company" size="wide" fillViewport>
        {creating ? (
          <form action={createCommerceConnectionFromForm} className="commerce-create-view">
            <input type="hidden" name="tab" value="connections" />
            <header className="commerce-page-head">
              <h1 className="commerce-page-title">Create a connection</h1>
              <p className="commerce-page-lead">
                Name the store, choose WooCommerce or a custom website, and pick a shop or warehouse for stock.
              </p>
            </header>
            {actionError ? (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            ) : null}
            <fieldset className="commerce-fields">
              <legend className="visually-hidden">Connection details</legend>
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
            </fieldset>
            <FormFooter>
              <Button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setActionError(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={!props.canWrite}>
                Create connection
              </Button>
            </FormFooter>
          </form>
        ) : (
          <>
            <header className="commerce-page-head">
              <div className="commerce-title-row">
                <div>
                  <h1 className="commerce-page-title">Commerce Integrations</h1>
                  <p className="commerce-page-lead">
                    Connect your website so BookOne can share stock levels and receive orders.{' '}
                    <a href="/docs/developers" target="_blank" rel="noopener noreferrer">
                      Developers &amp; Integrations
                    </a>
                  </p>
                </div>
                {props.canWrite && !empty ? (
                  <Button type="button" onClick={openCreate}>
                    New connection
                  </Button>
                ) : null}
              </div>
              {selected ? (
                <div className="commerce-store-bar">
                  <SelectField
                    id="commerce-store"
                    label="Store"
                    value={selected.id}
                    onChange={selectConnection}
                    options={props.connections.map((row) => ({
                      value: row.id,
                      label: row.name,
                      description: `${kindLabel(row.kind)} · ${row.environment} · ${modeLabel(row.postingMode)}`,
                    }))}
                  />
                  <div className="commerce-store-meta">
                    <p className="commerce-badges">
                      <Badge>{kindLabel(selected.kind)}</Badge>
                      <Badge>{selected.environment === 'live' ? 'Live' : 'Sandbox'}</Badge>
                      <Badge tone={selected.postingMode === 'posting' ? 'success' : 'neutral'}>
                        {selected.postingMode === 'posting' ? 'Posting' : 'Preview'}
                      </Badge>
                      <Badge>{selected.mappingCount} mapped</Badge>
                      <Badge tone={selected.reviewCount > 0 ? 'warning' : 'neutral'}>
                        {selected.reviewCount} need review
                      </Badge>
                    </p>
                    <p className={fleetLocation ? 'form-error' : 'field-help'}>
                      {locationName} · {selected.currency}
                      {selected.inboundPaused ? ' · inbound paused' : ''}
                      {selected.outboundPaused ? ' · outbound paused' : ''}
                      {fleetLocation ? ' · not eligible for online stock' : ''}
                    </p>
                  </div>
                </div>
              ) : null}
              {selected ? (
                <ol className="commerce-progress">
                  <li className="is-done">
                    <span>1</span> Create a connection
                  </li>
                  <li className={keyUsed ? 'is-done' : 'is-current'}>
                    <span>2</span> Connect your website
                  </li>
                  <li className={mapped ? 'is-done' : keyUsed ? 'is-current' : ''}>
                    <span>3</span> Map products and test sync
                  </li>
                  <li className={stockPublished ? 'is-done' : mapped ? 'is-current' : ''}>
                    <span>4</span> Verify stock and orders
                  </li>
                </ol>
              ) : null}
              {selected && nextAction ? (
                <div className="commerce-next">
                  <div>
                    <p className="commerce-next-kicker">{stockPublished ? 'Next' : 'Continue setup'}</p>
                    <strong>{nextAction.title}</strong>
                    <p>{nextAction.detail}</p>
                  </div>
                  {nextAction.label && tab !== nextAction.tab ? (
                    <Button type="button" variant="primary" onClick={() => changeTab(nextAction.tab)}>
                      {nextAction.label}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </header>
            {props.saved ? (
              <p className="form-success" role="status">
                {props.publishedCount && props.publishedCount > 0
                  ? `Published ${props.publishedCount} BookOne variant${props.publishedCount === 1 ? '' : 's'} at ${locationName}.`
                  : 'Changes saved.'}
              </p>
            ) : null}
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
                    Store this key on your website server. Never put it in a theme file. Issuing a key does not mean the store is
                    connected.
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

            {empty ? (
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
                  <li>
                    <strong>Verify stock and orders</strong>
                    <span>A paid last-unit order proves intake. HTTP 2xx is not cash settlement.</span>
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
            ) : (
              <>
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
                      onClick={() => changeTab(id)}
                      onKeyDown={(event) => tabKeyDown(event, index)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tab === 'connections' && selected ? (
                  <div
                    className="party-tab-panel"
                    role="tabpanel"
                    id="commerce-panel-connections"
                    aria-labelledby="commerce-tab-connections"
                  >
                    <p className="field-help">
                      Preview means incoming orders are reviewed before they are posted. Posted invoices can still show amount due
                      until a payment account is configured.
                    </p>
                    <dl className="commerce-sync-facts">
                      <div>
                        <dt>BookOne stock publication</dt>
                        <dd>{mapped ? formatWhen(selected.lastStock) : 'No mappings yet'}</dd>
                      </div>
                      <div>
                        <dt>Orders received</dt>
                        <dd>{formatWhen(selected.lastOrder)}</dd>
                      </div>
                      <div>
                        <dt>Last mapping change</dt>
                        <dd>{formatWhen(selected.lastCatalog)}</dd>
                      </div>
                    </dl>
                    <div className="commerce-split">
                      <section className="commerce-card">
                        <h2 className="commerce-section-title">API credentials</h2>
                        <p className="field-help">
                          Keys are shown once. They never appear in the page URL. Rotation keeps the current scopes.
                        </p>
                        <div className="commerce-copy-list">
                          <div className="commerce-copy-row">
                            <span>API endpoint</span>
                            <code>{props.apiBase}</code>
                            <Button type="button" onClick={() => void copyText(props.apiBase, 'Endpoint')}>
                              Copy endpoint
                            </Button>
                          </div>
                          <div className="commerce-copy-row">
                            <span>Connection ID</span>
                            <code>{selected.id}</code>
                            <Button type="button" onClick={() => void copyText(selected.id, 'Connection ID')}>
                              Copy connection ID
                            </Button>
                          </div>
                          <p className="field-help" role="status">
                            {issued ? '' : copyFeedback}
                          </p>
                        </div>
                        {selected.kind === 'woocommerce' ? (
                          <p className="field-help">
                            Install `bookone-commerce-1.2.0.zip`, turn HPOS on, then paste the endpoint and sandbox key.
                          </p>
                        ) : (
                          <p className="field-help">
                            Call this endpoint from your server with `Authorization: Bearer` and an Idempotency-Key on orders.
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
                        <form action={testCommerceConnectionFromForm} className="commerce-test-form">
                          <input type="hidden" name="connectionId" value={selected.id} />
                          <input type="hidden" name="tab" value="connections" />
                          <TextField
                            id={`test-token-${selected.id}`}
                            name="token"
                            label="Test a key (paste once)"
                            type="password"
                            autoComplete="new-password"
                            help="Confirms this key authenticates the selected store. It does not prove catalog or stock sync, and it does not enable live posting."
                          />
                          <Button type="submit">Test connection</Button>
                        </form>
                        <ul className="commerce-key-list">
                          {selected.credentials.length === 0 ? <li>No API keys have been issued.</li> : null}
                          {selected.credentials.map((cred) => (
                            <li key={cred.id}>
                              <span>
                                Prefix {cred.prefix} · {cred.status} · {cred.scopes.join(', ')} · last used{' '}
                                {cred.lastUsedAt ? formatWhen(cred.lastUsedAt) : 'never'}
                                {cred.expiresAt && cred.status === 'rotated'
                                  ? ` · overlap until ${formatWhen(cred.expiresAt)}`
                                  : ''}
                              </span>
                              {props.canWrite && cred.status === 'active' ? (
                                <span className="commerce-inline-actions">
                                  <form action={onRotate}>
                                    <input type="hidden" name="connectionId" value={selected.id} />
                                    <input type="hidden" name="credentialId" value={cred.id} />
                                    <input type="hidden" name="tab" value="connections" />
                                    <Button type="submit">Rotate</Button>
                                  </form>
                                  <Button type="button" onClick={() => setRevokeId(cred.id)}>
                                    Revoke
                                  </Button>
                                </span>
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
                          id={`posting-location-${selected.id}`}
                          name="locationId"
                          disabled={!props.canWrite}
                          label="Stock location"
                          value={locationDraft ?? selected.locationId ?? ''}
                          onChange={setLocationDraft}
                          options={[
                            { value: '', label: 'Choose a stock location' },
                            ...props.locations.map((l) => ({
                              value: l.id,
                              label: l.name,
                              disabled: isFleetLocationType(l.locationType),
                              description: locationReason(l.locationType),
                            })),
                          ]}
                          help={
                            fleetLocation
                              ? locationReason(selectedLocation?.locationType ?? '')
                              : 'Online stock uses this shop or warehouse.'
                          }
                        />
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
                          help="Choosing posting prepares the setting. Save applies it with the pause checkboxes. A posted invoice is not cash settlement until a payment account is configured."
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

                {tab === 'mapping' ? (
                  <div
                    className="party-tab-panel"
                    role="tabpanel"
                    id="commerce-panel-mapping"
                    aria-labelledby="commerce-tab-mapping"
                  >
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
                      <div key={`map-${selected.id}`} className="commerce-panel-stack">
                        {props.productsError ? (
                          <section className="commerce-empty-panel" role="alert">
                            <p>{props.productsError} Refresh this page to retry. Do not recreate products until the catalog loads.</p>
                            <Link className="button secondary" href={mappingReturn}>
                              Retry
                            </Link>
                          </section>
                        ) : null}
                        {!props.productsError && props.products.length === 0 ? (
                          <section className="commerce-empty-panel">
                            <h2 className="commerce-section-title">The BookOne catalog is empty</h2>
                            <p className="field-help">
                              Add a sellable BookOne product before mapping SKUs. Search appears after products exist.
                            </p>
                            <Link className="button primary" href={`/inventory/products?from=${encodeURIComponent(mappingReturn)}`}>
                              Open Products
                            </Link>
                          </section>
                        ) : null}
                        {selected.mappings.length > 0 ? (
                          <SearchField
                            id="map-search"
                            label="Search mappings"
                            value={mapQuery}
                            onChange={setMapQuery}
                            placeholder="SKU, BookOne name, store product"
                            showLabel
                          />
                        ) : !props.productsError && props.products.length > 0 ? (
                          <p className="field-help">Nothing mapped yet for this store. Preview a SKU, then apply it.</p>
                        ) : null}
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
                        ) : selected.mappings.length > 0 ? (
                          <p className="field-help">No mappings match your search.</p>
                        ) : null}

                        {selected.proposals?.length ? (
                          <section className="commerce-card">
                            <h2 className="commerce-section-title">Agent mapping proposals</h2>
                            <p className="field-help">
                              Review suggested links. Apply stays in BookOne. Agents cannot change stock, prices, or posting.
                            </p>
                            {selected.proposals.map((proposal) => (
                              <div key={proposal.id} className="commerce-card">
                                <p>
                                  {proposal.origin === 'verified_store' ? 'Verified store data' : 'Agent-supplied'} ·{' '}
                                  {proposal.status}
                                </p>
                                <ul>
                                  {proposal.items.map((item, index) => (
                                    <li key={`${proposal.id}-${index}`}>
                                      {item.sku || 'No SKU'} · {item.bookoneName ?? 'Unmatched'} · {item.kind} · {item.reason}
                                    </li>
                                  ))}
                                </ul>
                                {props.canWrite ? (
                                  <FormFooter>
                                    <form action={applyCommerceMappingProposalFromForm}>
                                      <input type="hidden" name="connectionId" value={selected.id} />
                                      <input type="hidden" name="proposalId" value={proposal.id} />
                                      <input type="hidden" name="tab" value="mapping" />
                                      <Button variant="primary" type="submit">
                                        Apply proposal
                                      </Button>
                                    </form>
                                    <form action={rejectCommerceMappingProposalFromForm}>
                                      <input type="hidden" name="connectionId" value={selected.id} />
                                      <input type="hidden" name="proposalId" value={proposal.id} />
                                      <input type="hidden" name="tab" value="mapping" />
                                      <Button type="submit">Reject proposal</Button>
                                    </form>
                                  </FormFooter>
                                ) : null}
                              </div>
                            ))}
                          </section>
                        ) : null}

                        {props.canWrite && props.products.length > 0 ? (
                          <form
                            action={async (data) => {
                              const result = await previewCommercePublishFromForm(data);
                              if (!result.ok) {
                                setActionError(result.error);
                                setPublishPreview([]);
                                return;
                              }
                              setActionError(null);
                              setPublishPreview(result.items);
                            }}
                            className="commerce-map-form"
                          >
                            <input type="hidden" name="connectionId" value={selected.id} />
                            <input type="hidden" name="tab" value="mapping" />
                            <fieldset className="commerce-fields">
                              <legend className="commerce-section-title">Publish from BookOne</legend>
                              <p className="field-help">
                                For an empty store. WooCommerce creations default to draft. Custom websites create listings
                                themselves, then acknowledge stable IDs.
                              </p>
                              <div className="commerce-table-scroll" tabIndex={0} role="region" aria-label="Products to publish">
                                <table className="commerce-table">
                                  <thead>
                                    <tr>
                                      <th>Publish</th>
                                      <th>SKU</th>
                                      <th>BookOne</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {props.products.map((p) => (
                                      <tr key={p.id}>
                                        <td>
                                          <input type="checkbox" name="publishProductId" value={p.id} />
                                        </td>
                                        <td>{p.sku}</td>
                                        <td>{p.name}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <FormFooter>
                                <Button type="submit">Preview publish</Button>
                                <Button variant="primary" type="submit" formAction={queueCommercePublishFromForm} disabled={!props.canWrite}>
                                  Queue publish
                                </Button>
                              </FormFooter>
                            </fieldset>
                          </form>
                        ) : null}
                        {publishPreview.length ? (
                          <div className="commerce-card" role="status">
                            <h2 className="commerce-section-title">Publish preview</h2>
                            <ul>
                              {publishPreview.map((row) => (
                                <li key={row.bookoneProductId}>
                                  {row.sku || row.bookoneProductId} · {row.name ?? 'Unknown'} · {row.kind} · {row.reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {selected.publishClaims?.length ? (
                          <p className="field-help">
                            Queued claims: {selected.publishClaims.map((c) => `${c.sku} (${c.status})`).join(', ')}. The store
                            pulls `/catalog/candidates` and acknowledges IDs. GET `/products` stays mapped-only.
                          </p>
                        ) : null}

                        {props.canWrite && props.products.length > 0 ? (
                          <form action={onPreviewMapping} className="commerce-map-form">
                            <input type="hidden" name="connectionId" value={selected.id} />
                            <input type="hidden" name="tab" value="mapping" />
                            <fieldset className="commerce-fields">
                              <legend className="commerce-section-title">Link existing products</legend>
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
                        <form action={props.canWrite ? publishCommerceStockFromForm : undefined} className="commerce-publish">
                          <input type="hidden" name="connectionId" value={selected.id} />
                          <input type="hidden" name="tab" value="mapping" />
                          <Button
                            type="submit"
                            disabled={
                              !props.canWrite || selected.mappingCount === 0 || selected.outboundPaused || fleetLocation
                            }
                          >
                            Publish BookOne stock
                          </Button>
                          <p className="field-help">
                            {selected.mappingCount === 0
                              ? 'Map a SKU before publishing. BookOne will not record a successful publication for zero items.'
                              : fleetLocation
                                ? `Choose a shop or warehouse. ${locationName} cannot receive online stock.`
                                : `Publishes absolute BookOne quantities for mapped SKUs at ${locationName}. Store acknowledgment is separate.`}
                          </p>
                        </form>
                      </div>
                    )}
                  </div>
                ) : null}

                {tab === 'activity' ? (
                  <div
                    className="party-tab-panel"
                    role="tabpanel"
                    id="commerce-panel-activity"
                    aria-labelledby="commerce-tab-activity"
                  >
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
                      <div key={`act-${selected.id}`} className="commerce-panel-stack">
                        <section className="commerce-card">
                          <h2 className="commerce-section-title">Orders needing review</h2>
                          {selected.reviews.length ? (
                            <div className="commerce-table-scroll" tabIndex={0} role="region" aria-label="Orders needing review">
                              <table className="commerce-table">
                                <thead>
                                  <tr>
                                    <th>Order</th>
                                    <th>Outcome</th>
                                    <th>Reason</th>
                                    <th>When (Asia/Colombo)</th>
                                    <th>Next action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selected.reviews.map((row) => (
                                    <tr key={row.id}>
                                      <td>{row.externalId}</td>
                                      <td>{row.status}</td>
                                      <td>{row.reviewReason ?? 'Needs review'}</td>
                                      <td>{formatWhen(row.createdAt)}</td>
                                      <td>
                                        {props.canWrite ? (
                                          <form action={retryCommerceReviewFromForm}>
                                            <input type="hidden" name="connectionId" value={selected.id} />
                                            <input type="hidden" name="orderId" value={row.id} />
                                            <input type="hidden" name="tab" value="activity" />
                                            <Button type="submit">Retry posting</Button>
                                          </form>
                                        ) : (
                                          'Waiting for an owner'
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="field-help">No orders are waiting for review.</p>
                          )}
                          <p className="field-help">
                            Posted invoices can still show amount due until a payment account is configured. That is invoice
                            posting, not cash settlement. HTTP 2xx is not accounting acceptance.
                          </p>
                        </section>
                        <section>
                          <h2 className="commerce-section-title">Audit trail</h2>
                          {selected.activity.length > 5 ? (
                            <SearchField
                              id="activity-search"
                              label="Search activity"
                              value={activityQuery}
                              onChange={setActivityQuery}
                              placeholder="Action, record or store"
                              showLabel
                            />
                          ) : null}
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
                                    <th>Action</th>
                                    <th>Record</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredActivity.map((row) => (
                                    <tr key={row.id}>
                                      <td>{formatWhen(row.createdAt)}</td>
                                      <td>{ACTION_LABELS[row.action] ?? row.action}</td>
                                      <td>{ENTITY_LABELS[row.entity] ?? row.entity}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </section>
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </FormShell>

      <ConfirmDialog
        open={confirmPosting}
        title="Change the posting mode?"
        message="When you save this setting, supported paid orders can create BookOne sales invoices and move stock. A posted invoice is not cash settlement until a payment account is configured."
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
