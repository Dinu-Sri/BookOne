'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ConnectionKind, CommerceEnvironment, MappingInput } from '@bookone/commerce';
import { authenticateCommerceRequest, operatorFromSession, withCommerceService } from '@/lib/commerce-runtime';

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
  const tab = String(formData.get('tab') ?? extra.tab ?? 'connections');
  const connection = String(formData.get('connectionId') ?? extra.connection ?? '');
  if (tab) params.set('tab', tab);
  if (connection) params.set('connection', connection);
  if (extra.saved) params.set('saved', extra.saved);
  if (extra.err) params.set('err', extra.err);
  const query = params.toString();
  return query ? `/company/commerce?${query}` : '/company/commerce';
}

function finish(formData: FormData, extra: Record<string, string | undefined> = {}): never {
  revalidatePath('/company/commerce');
  redirect(commercePath(formData, extra));
}

export async function createCommerceConnectionFromForm(formData: FormData) {
  const operator = await operatorFromSession();
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
    redirect(commercePath(formData, { saved: '1', connection: row.id, tab: 'connections' }));
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not create the connection.' });
  }
}

export async function issueCommerceCredentialFromForm(formData: FormData): Promise<IssuedCredentialResult> {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  try {
    const issued = await withCommerceService(operator.tenantId, (service) => service.issueCredential(operator, connectionId));
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
  try {
    await withCommerceService(operator.tenantId, (service) =>
      service.updateConnection(operator, String(formData.get('connectionId') ?? ''), {
        postingMode: String(formData.get('postingMode') ?? 'preview') === 'posting' ? 'posting' : 'preview',
        inboundPaused: formData.get('inboundPaused') === 'on',
        outboundPaused: formData.get('outboundPaused') === 'on',
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
    await withCommerceService(operator.tenantId, (service) => service.applyMappings(operator, connectionId, [mapping]));
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not apply the mapping.', tab: 'mapping' });
  }
  finish(formData, { saved: '1', tab: 'mapping' });
}

export async function publishCommerceStockFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  try {
    await withCommerceService(operator.tenantId, (service) =>
      service.publishStock(operator, String(formData.get('connectionId') ?? '')),
    );
  } catch (e) {
    rethrowNav(e);
    finish(formData, { err: e instanceof Error ? e.message : 'Could not publish stock.', tab: 'mapping' });
  }
  finish(formData, { saved: '1', tab: 'mapping' });
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
