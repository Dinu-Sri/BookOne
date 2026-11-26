'use server';

import { revalidatePath } from 'next/cache';
import { probeModuleWriteDetail } from '@/lib/module-access';
import { redirect } from 'next/navigation';
import {
  UNPAID_METHOD,
  parseScopes,
  paymentMethodKey,
  type ConnectionKind,
  type CommerceEnvironment,
  type MappingInput,
} from '@bookone/commerce';
import { authenticateCommerceRequest, operatorFromSession, withCommerceService } from '@/lib/commerce-runtime';
import { createGatewayClearingAccount, listCommercePaymentAccounts } from '@/lib/commerce-payment-accounts';
import { writeDeniedMessage } from '@/lib/access';

export type CommerceActionResult =
  | { ok: true; saved?: boolean }
  | { ok: false; error: string };

export type IssuedCredentialResult =
  | {
      ok: true;
      token: string;
      prefix: string;
      connectionId: string;
      previousExpiresAt?: string | null;
      rotatedFromPrefix?: string | null;
    }
  | { ok: false; error: string };

export type MappingPreviewResult =
  | {
      ok: true;
      items: Array<{
        sku: string;
        bookoneProductId: string;
        bookoneName: string | null;
        externalProductId: string;
        externalVariantId: string;
        issue: string | null;
      }>;
    }
  | { ok: false; error: string };

function rethrowNav(error: unknown): void {
  const digest = typeof error === 'object' && error && 'digest' in error ? String((error as { digest?: string }).digest) : '';
  if (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND')) throw error;
}

function commercePath(formData: FormData, extra: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  const tab = String(formData.get('tab') ?? extra.tab ?? 'overview');
  const connection = String(formData.get('connectionId') ?? extra.connection ?? '');
  if (tab) params.set('tab', tab);
  if (connection) params.set('connection', connection);
  if (extra.saved) params.set('saved', extra.saved);
  if (extra.err) params.set('err', extra.err);
  if (extra.published) params.set('published', extra.published);
  const list = extra.list ?? (tab === 'prices' ? String(formData.get('priceListId') ?? '') : '');
  if (list) params.set('list', list);
  const order = String(formData.get('orderId') ?? extra.order ?? '');
  if (order) params.set('order', order);
  const query = params.toString();
  return query ? `/company/commerce?${query}` : '/company/commerce';
}

function finish(formData: FormData, extra: Record<string, string | undefined> = {}): never {
  revalidatePath('/company/commerce');
  redirect(commercePath(formData, extra));
}

/** QA-1126-06/12: a connection posts stock, so it needs Inventory and a stock location. */
async function commerceConnectionBlocker(formData: FormData): Promise<string | null> {
  const inventory = await probeModuleWriteDetail('inventory');
  if (inventory.reason === 'module_off' || inventory.reason === 'tier') {
    return 'Commerce connections need Inventory, which is not part of this company’s plan. Upgrade to Growth or Pro first.';
  }
  if (!String(formData.get('locationId') ?? '').trim()) {
    return 'Choose the stock location this store sells from. Add one under Company → Locations if the list is empty.';
  }
  return null;
}

export async function createCommerceConnectionFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const blocked = await commerceConnectionBlocker(formData);
  if (blocked) finish(formData, { err: blocked });
  try {
    const row = await withCommerceService(operator.tenantId, (service) =>
      service.createConnection(operator, {
        name: String(formData.get('name') ?? ''),
        kind: String(formData.get('kind') ?? 'custom_website') as ConnectionKind,
        environment: String(formData.get('environment') ?? 'sandbox') as CommerceEnvironment,
        locationId: String(formData.get('locationId') ?? '') || null,
        currency: String(formData.get('currency') ?? 'LKR'),
      }),
    );
    revalidatePath('/company/commerce');
    redirect(commercePath(formData, { saved: '1', connection: row.id, tab: 'developer' }));
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not create the connection.' });
  }
}

export async function issueCommerceCredentialFromForm(formData: FormData): Promise<IssuedCredentialResult> {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  try {
    const issued = await withCommerceService(operator.tenantId, (service) =>
      service.issueCredential(operator, connectionId, parseScopes(formData.getAll('scope').map(String))),
    );
    revalidatePath('/company/commerce');
    return { ok: true, token: issued.token, prefix: issued.prefix, connectionId };
  } catch (e) {
    rethrowNav(e);
    return { ok: false, error: e instanceof Error ? e.message : 'Could not issue a key.' };
  }
}

export async function rotateCommerceCredentialFromForm(formData: FormData): Promise<IssuedCredentialResult> {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  try {
    const issued = await withCommerceService(operator.tenantId, (service) =>
      service.rotateCredential(operator, connectionId, String(formData.get('credentialId') ?? '')),
    );
    revalidatePath('/company/commerce');
    return {
      ok: true,
      token: issued.token,
      prefix: issued.prefix,
      connectionId,
      previousExpiresAt: issued.previousExpiresAt,
      rotatedFromPrefix: issued.rotatedFromPrefix,
    };
  } catch (e) {
    rethrowNav(e);
    return { ok: false, error: e instanceof Error ? e.message : 'Could not rotate the key.' };
  }
}

export async function revokeCommerceCredentialFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  try {
    await withCommerceService(operator.tenantId, (service) =>
      service.revokeCredential(operator, String(formData.get('connectionId') ?? ''), String(formData.get('credentialId') ?? '')),
    );
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not revoke the key.' });
  }
  finish(formData, { saved: '1' });
}

export async function updateCommerceConnectionFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  if (String(formData.get('postingMode') ?? '') === 'posting' && !String(formData.get('locationId') ?? '').trim()) {
    finish(formData, { err: 'Choose a stock location before turning posting on.' });
  }
  try {
    await withCommerceService(operator.tenantId, (service) =>
      service.updateConnection(operator, String(formData.get('connectionId') ?? ''), {
        postingMode: String(formData.get('postingMode') ?? 'preview') === 'posting' ? 'posting' : 'preview',
        inboundPaused: formData.get('inboundPaused') === 'on',
        outboundPaused: formData.get('outboundPaused') === 'on',
        locationId: String(formData.get('locationId') ?? '') || null,
      }),
    );
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not update the connection.' });
  }
  finish(formData, { saved: '1' });
}

export async function previewCommerceMappingFromForm(formData: FormData): Promise<MappingPreviewResult> {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  const mapping = mappingFromForm(formData);
  try {
    const preview = await withCommerceService(operator.tenantId, (service) =>
      service.previewMappings(operator, connectionId, [mapping]),
    );
    return { ok: true, items: preview.items };
  } catch (e) {
    rethrowNav(e);
    return { ok: false, error: e instanceof Error ? e.message : 'Could not preview the mapping.' };
  }
}

export async function applyCommerceMappingFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  const mapping = mappingFromForm(formData);
  try {
    await withCommerceService(operator.tenantId, async (service) => {
      const { items } = await service.previewMappings(operator, connectionId, [mapping]);
      const issue = items.find((item) => item.issue)?.issue;
      if (issue) throw new Error(issue);
      return service.applyMappings(operator, connectionId, [mapping]);
    });
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not apply the mapping.', tab: 'mapping' });
  }
  finish(formData, { saved: '1', tab: 'mapping' });
}

export async function applyCommerceMappingProposalFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  try {
    await withCommerceService(operator.tenantId, (service) =>
      service.applyMappingProposal(operator, connectionId, String(formData.get('proposalId') ?? '')),
    );
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not apply the proposal.', tab: 'mapping' });
  }
  finish(formData, { saved: '1', tab: 'mapping' });
}

export async function rejectCommerceMappingProposalFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  try {
    await withCommerceService(operator.tenantId, (service) =>
      service.rejectMappingProposal(
        operator,
        String(formData.get('connectionId') ?? ''),
        String(formData.get('proposalId') ?? ''),
      ),
    );
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not reject the proposal.', tab: 'mapping' });
  }
  finish(formData, { saved: '1', tab: 'mapping' });
}

export type PublishPreviewResult =
  | {
      ok: true;
      items: Array<{ bookoneProductId: string; sku: string; name: string | null; kind: string; reason: string }>;
    }
  | { ok: false; error: string };

export async function previewCommercePublishFromForm(formData: FormData): Promise<PublishPreviewResult> {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  const productIds = formData.getAll('publishProductId').map(String).filter(Boolean);
  try {
    const preview = await withCommerceService(operator.tenantId, (service) =>
      service.previewPublish(operator, connectionId, productIds),
    );
    return { ok: true, items: preview.items };
  } catch (e) {
    rethrowNav(e);
    return { ok: false, error: e instanceof Error ? e.message : 'Could not preview publish.' };
  }
}

export async function queueCommercePublishFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  const productIds = formData.getAll('publishProductId').map(String).filter(Boolean);
  try {
    await withCommerceService(operator.tenantId, async (service) => {
      const preview = await service.previewPublish(operator, connectionId, productIds);
      if (!preview.items.some((item) => item.kind === 'create')) {
        throw new Error('No eligible products to publish.');
      }
      return service.queuePublish(operator, connectionId, productIds);
    });
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not queue publish.', tab: 'mapping' });
  }
  finish(formData, { saved: '1', tab: 'mapping' });
}

export async function publishCommerceStockFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  try {
    const result = await withCommerceService(operator.tenantId, (service) =>
      service.publishStock(operator, String(formData.get('connectionId') ?? '')),
    );
    finish(formData, { saved: '1', tab: 'mapping', published: String(result.published) });
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not publish stock.', tab: 'mapping' });
  }
}

export async function retryCommerceReviewFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  try {
    await withCommerceService(operator.tenantId, (service) =>
      service.retryReviewOrder(operator, String(formData.get('connectionId') ?? ''), String(formData.get('orderId') ?? '')),
    );
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not retry the order.', tab: 'activity' });
  }
  finish(formData, { saved: '1', tab: 'activity' });
}

export async function testCommerceConnectionFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const token = String(formData.get('token') ?? '');
  try {
    const actor = await authenticateCommerceRequest(`Bearer ${token}`);
    if (actor.tenantId !== operator.tenantId) {
      finish(formData, { err: 'That key belongs to another company.' });
    }
    if (actor.connectionId !== String(formData.get('connectionId') ?? actor.connectionId)) {
      finish(formData, { err: 'That key belongs to a different store.' });
    }
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Connection test failed.' });
  }
  finish(formData, { saved: '1' });
}

function mappingFromForm(formData: FormData): MappingInput {
  return {
    bookoneProductId: String(formData.get('bookoneProductId') ?? ''),
    sku: String(formData.get('sku') ?? ''),
    externalProductId: String(formData.get('externalProductId') ?? ''),
    externalVariantId: String(formData.get('externalVariantId') ?? ''),
  };
}

/** Payments settings: where paid web orders settle, per store and per payment method. */
export async function saveCommercePaymentsFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  try {
    const allowed = new Set((await listCommercePaymentAccounts(operator.tenantId)).map((a) => a.code));
    const pick = (raw: FormDataEntryValue | null): string | null => {
      const code = String(raw ?? '').trim();
      if (!code) return null;
      if (code === UNPAID_METHOD) return UNPAID_METHOD;
      if (!allowed.has(code)) throw new Error(`Account ${code} cannot receive payments. Choose a cash, bank or clearing account.`);
      return code;
    };
    const defaultAccountCode = pick(formData.get('defaultAccountCode'));
    if (defaultAccountCode === UNPAID_METHOD) throw new Error('The default must be an account. Leave it empty to keep orders unpaid.');
    const names = formData.getAll('methodName').map((v) => paymentMethodKey(String(v)));
    const values = formData.getAll('methodAccount');
    const methods: Record<string, string> = {};
    names.forEach((name, i) => {
      const code = pick(values[i] ?? null);
      if (name && code) methods[name] = code;
    });
    const newName = paymentMethodKey(String(formData.get('newMethodName') ?? ''));
    const newCode = pick(formData.get('newMethodAccount'));
    if (newName && newCode) methods[newName] = newCode;
    await withCommerceService(operator.tenantId, (service) =>
      service.updatePaymentSettings(operator, connectionId, { defaultAccountCode, methods, seenMethods: [] }),
    );
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not save payment settings.' });
  }
  finish(formData, { saved: '1' });
}

/** Creates "<gateway> clearing" (1201–1299) and uses it as the store default when none is set. */
export async function createCommerceClearingAccountFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  try {
    if (!operator.canWrite) throw new Error('You do not have permission to change this connection.');
    const denied = await writeDeniedMessage('accounting.accounts.write');
    if (denied) throw new Error('Creating an account needs Accounts write access. Ask an Owner or Accountant.');
    const created = await createGatewayClearingAccount(operator.tenantId, String(formData.get('gatewayName') ?? ''));
    await withCommerceService(operator.tenantId, async (service) => {
      const view = await service.listOperatorView(operator);
      const current = view.find((v) => v.connection.id === connectionId)?.connection.paymentSettings;
      if (!current?.defaultAccountCode) {
        await service.updatePaymentSettings(operator, connectionId, {
          defaultAccountCode: created.code,
          methods: current?.methods ?? {},
          seenMethods: [],
        });
      }
    });
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not create the clearing account.' });
  }
  finish(formData, { saved: '1' });
}

const WEB_ORDER_OPS = ['confirm', 'paid', 'dispatch', 'delivered', 'cancel', 'refund', 'refund_restock'] as const;
type WebOrderOp = (typeof WEB_ORDER_OPS)[number];

/** Staff actions on a web order (WP0): confirm, mark paid, dispatch, delivered, cancel, refund. */
export async function webOrderActionFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  const orderId = String(formData.get('orderId') ?? '');
  const op = String(formData.get('op') ?? '') as WebOrderOp;
  try {
    if (!WEB_ORDER_OPS.includes(op)) throw new Error('Unknown order action.');
    await withCommerceService(operator.tenantId, async (service) => {
      if (op === 'confirm') return service.confirmWebOrder(operator, connectionId, orderId);
      if (op === 'paid') return service.markWebOrderPaid(operator, connectionId, orderId);
      if (op === 'delivered') return service.markWebOrderDelivered(operator, connectionId, orderId);
      if (op === 'cancel') return service.cancelWebOrder(operator, connectionId, orderId);
      if (op === 'refund' || op === 'refund_restock') {
        return service.refundWebOrder(operator, connectionId, orderId, { restock: op === 'refund_restock' });
      }
      const view = await service.listOperatorView(operator);
      const couriers = view.find((v) => v.connection.id === connectionId)?.connection.paymentSettings?.couriers ?? [];
      const carrier = String(formData.get('carrier') ?? '').trim();
      return service.dispatchWebOrder(operator, connectionId, orderId, {
        carrier,
        trackingNumber: String(formData.get('trackingNumber') ?? ''),
        trackingUrlTemplate: couriers.find((c) => c.name === carrier)?.trackingUrlTemplate ?? null,
      });
    });
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not update the order.', tab: 'orders' });
  }
  finish(formData, { saved: '1', tab: 'orders' });
}

/** Which payment methods hold stock while unpaid, and the courier list for Dispatch. */
export async function saveCommerceFulfilmentSettingsFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  try {
    const hold = formData.getAll('holdStock').map((v) => paymentMethodKey(String(v))).filter(Boolean);
    const extraHold = String(formData.get('holdStockExtra') ?? '')
      .split(',')
      .map((v) => paymentMethodKey(v))
      .filter(Boolean);
    const names = formData.getAll('courierName').map((v) => String(v).trim());
    const templates = formData.getAll('courierTemplate').map((v) => String(v).trim());
    const couriers = names
      .map((name, i) => ({ name, trackingUrlTemplate: templates[i] || null }))
      .filter((c) => c.name);
    for (const c of couriers) {
      if (c.trackingUrlTemplate && (!/^https:\/\//i.test(c.trackingUrlTemplate) || !c.trackingUrlTemplate.includes('{tracking}'))) {
        throw new Error(`Tracking link for ${c.name} must start with https:// and contain {tracking}.`);
      }
    }
    await withCommerceService(operator.tenantId, async (service) => {
      const view = await service.listOperatorView(operator);
      const current = view.find((v) => v.connection.id === connectionId)?.connection.paymentSettings;
      return service.updatePaymentSettings(operator, connectionId, {
        defaultAccountCode: current?.defaultAccountCode ?? null,
        methods: current?.methods ?? {},
        seenMethods: [],
        commitStockMethods: [...new Set([...hold, ...extraHold])],
        couriers,
      });
    });
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not save fulfilment settings.', tab: 'settings' });
  }
  finish(formData, { saved: '1', tab: 'settings' });
}

/** WP1 C1: publish or unpublish products on a channel (bulk). */
export async function setChannelPublishingFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  const ids = formData.getAll('productId').map(String).filter(Boolean);
  const publish = String(formData.get('publish') ?? '1') === '1';
  try {
    await withCommerceService(operator.tenantId, (service) =>
      service.setChannelPublishing(operator, connectionId, ids, publish),
    );
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not change publishing.', tab: 'mapping' });
  }
  finish(formData, { saved: '1', tab: 'mapping' });
}

/** WP1 C4: safety buffer, channel-wide backorder and timezone. */
export async function saveChannelSettingsFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  try {
    const raw = String(formData.get('safetyBuffer') ?? '0').trim();
    const buffer = raw === '' ? 0 : Number(raw);
    if (!Number.isInteger(buffer) || buffer < 0) throw new Error('Safety buffer must be a whole number of 0 or more.');
    await withCommerceService(operator.tenantId, (service) =>
      service.updateChannelSettings(operator, connectionId, {
        safetyBuffer: buffer,
        allowBackorder: formData.get('allowBackorder') === 'on',
        timezone: String(formData.get('timezone') ?? 'Asia/Colombo').trim() || 'Asia/Colombo',
      }),
    );
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not save store settings.', tab: 'settings' });
  }
  finish(formData, { saved: '1', tab: 'settings' });
}

/** WP1 sandbox data: sample art-supplies catalog published to a sandbox connection. */
export async function seedSampleCatalogFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  try {
    if (!operator.canWrite) throw new Error('You do not have permission to change this connection.');
    const inventory = await probeModuleWriteDetail('inventory');
    if (!inventory.canWrite) throw new Error('Adding sample products needs Inventory write access.');
    const { withTenantContext } = await import('@bookone/db');
    await withCommerceService(operator.tenantId, async (service) => {
      const view = await service.listOperatorView(operator);
      const connection = view.find((v) => v.connection.id === connectionId)?.connection;
      if (!connection) throw new Error('Connection was not found.');
      if (connection.environment !== 'sandbox') throw new Error('Sample products can only be added to a sandbox connection.');
      const { seedSampleCatalog } = await import('@/lib/commerce-sample-catalog');
      await withTenantContext(operator.tenantId, () =>
        seedSampleCatalog({ tenantId: operator.tenantId, userId: operator.userId, connectionId, locationId: connection.locationId }),
      );
      await service.notifyProductsChanged(operator.tenantId, (await service.channelCatalogForOperator(operator, connectionId)).products.map((p) => p.id), 'product');
    });
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not add the sample catalog.', tab: 'developer' });
  }
  finish(formData, { saved: '1', tab: 'mapping' });
}

// ---------------------------------------------------------------------------
// WP2: price lists and channel prices
// ---------------------------------------------------------------------------

function moneyOrNull(raw: FormDataEntryValue | null, label: string): string | null {
  const v = String(raw ?? '').trim().replace(/,/g, '');
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number of 0 or more.`);
  return n.toFixed(2);
}

export async function savePriceListFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const archive = formData.get('archive') === '1';
  let savedId = '';
  try {
    const result = await withCommerceService(operator.tenantId, (service) =>
      service.savePriceList(operator, {
        id: String(formData.get('priceListId') ?? '') || undefined,
        name: String(formData.get('name') ?? ''),
        customerGroup: String(formData.get('customerGroup') ?? '') || null,
        archive,
      }),
    );
    savedId = result.id;
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not save the price list.', tab: 'prices' });
  }
  finish(formData, { saved: '1', tab: 'prices', list: archive ? '' : savedId });
}

export async function setChannelPriceListFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  try {
    const listId = String(formData.get('channelPriceListId') ?? '');
    await withCommerceService(operator.tenantId, (service) => service.setChannelPriceList(operator, connectionId, listId || null));
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not change the price list.', tab: 'prices' });
  }
  finish(formData, { saved: '1', tab: 'prices' });
}

/** One product's price on a list (list price, was-price, scheduled sale, quantity tiers). */
export async function savePriceEntryFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  try {
    const { parseTiers } = await import('@bookone/commerce');
    const { zonedDayBoundary } = await import('@/lib/zoned-day');
    const tz = String(formData.get('timezone') ?? 'Asia/Colombo') || 'Asia/Colombo';
    const from = String(formData.get('saleFrom') ?? '').trim();
    const to = String(formData.get('saleTo') ?? '').trim();
    const row = {
      productId: String(formData.get('productId') ?? ''),
      price: moneyOrNull(formData.get('price'), 'Price'),
      compareAtPrice: moneyOrNull(formData.get('compareAtPrice'), 'Was price'),
      salePrice: moneyOrNull(formData.get('salePrice'), 'Sale price'),
      saleStartsAt: from ? zonedDayBoundary(from, tz, false) : null,
      saleEndsAt: to ? zonedDayBoundary(to, tz, true) : null,
      tiers: parseTiers(String(formData.get('tiers') ?? '')),
    };
    if (!row.productId) throw new Error('Choose a product.');
    await withCommerceService(operator.tenantId, (service) =>
      service.savePriceEntries(operator, String(formData.get('priceListId') ?? ''), [row]),
    );
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not save the price.', tab: 'prices' });
  }
  finish(formData, { saved: '1', tab: 'prices' });
}

/** Bulk: set list prices from the BookOne sell price ± a percentage, or clear them. */
export async function bulkPriceListFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  try {
    const listId = String(formData.get('priceListId') ?? '');
    const clear = formData.get('clear') === '1';
    const pct = Number(String(formData.get('percent') ?? '0').trim() || '0');
    if (!clear && (!Number.isFinite(pct) || pct < -90 || pct > 500)) throw new Error('Percentage must be between -90 and 500.');
    await withCommerceService(operator.tenantId, async (service) => {
      const { rows } = await service.pricesForOperator(operator, connectionId, listId);
      return service.savePriceEntries(
        operator,
        listId,
        rows.map((r) => ({
          productId: r.productId,
          price: clear ? null : (Math.round(Number(r.basePrice) * (1 + pct / 100) * 100) / 100).toFixed(2),
          compareAtPrice: clear ? null : r.compareAtPrice,
          salePrice: clear ? null : r.salePrice,
          saleStartsAt: clear ? null : r.saleStartsAt,
          saleEndsAt: clear ? null : r.saleEndsAt,
          tiers: clear ? [] : r.tiers,
        })),
      );
    });
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not update the prices.', tab: 'prices' });
  }
  finish(formData, { saved: '1', tab: 'prices' });
}
