'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ConnectionKind, CommerceEnvironment, MappingInput } from '@bookone/commerce';
import { authenticateCommerceRequest, operatorFromSession, withCommerceService } from '@/lib/commerce-runtime';

function back(err?: string) {
  revalidatePath('/company/commerce');
  redirect(err ? `/company/commerce?err=${encodeURIComponent(err)}` : '/company/commerce?saved=1');
}

export async function createCommerceConnectionFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  try {
    await withCommerceService(operator.tenantId, (service) =>
      service.createConnection(operator, {
        name: String(formData.get('name') ?? ''),
        kind: String(formData.get('kind') ?? 'custom_website') as ConnectionKind,
        environment: String(formData.get('environment') ?? 'sandbox') as CommerceEnvironment,
        locationId: String(formData.get('locationId') ?? '') || null,
        currency: String(formData.get('currency') ?? 'LKR'),
      }),
    );
    back();
  } catch (e) {
    back(e instanceof Error ? e.message : 'Could not create the connection.');
  }
}

export async function issueCommerceCredentialFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  try {
    const issued = await withCommerceService(operator.tenantId, (service) => service.issueCredential(operator, connectionId));
    revalidatePath('/company/commerce');
    redirect(`/company/commerce?issued=${encodeURIComponent(issued.token)}&prefix=${encodeURIComponent(issued.prefix)}`);
  } catch (e) {
    back(e instanceof Error ? e.message : 'Could not issue a key.');
  }
}

export async function rotateCommerceCredentialFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  try {
    const issued = await withCommerceService(operator.tenantId, (service) =>
      service.rotateCredential(operator, String(formData.get('connectionId') ?? ''), String(formData.get('credentialId') ?? '')),
    );
    revalidatePath('/company/commerce');
    redirect(`/company/commerce?issued=${encodeURIComponent(issued.token)}&prefix=${encodeURIComponent(issued.prefix)}`);
  } catch (e) {
    back(e instanceof Error ? e.message : 'Could not rotate the key.');
  }
}

export async function revokeCommerceCredentialFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  try {
    await withCommerceService(operator.tenantId, (service) =>
      service.revokeCredential(operator, String(formData.get('connectionId') ?? ''), String(formData.get('credentialId') ?? '')),
    );
    back();
  } catch (e) {
    back(e instanceof Error ? e.message : 'Could not revoke the key.');
  }
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
    back();
  } catch (e) {
    back(e instanceof Error ? e.message : 'Could not update the connection.');
  }
}

export async function applyCommerceMappingFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const connectionId = String(formData.get('connectionId') ?? '');
  const mapping: MappingInput = {
    bookoneProductId: String(formData.get('bookoneProductId') ?? ''),
    sku: String(formData.get('sku') ?? ''),
    externalProductId: String(formData.get('externalProductId') ?? ''),
    externalVariantId: String(formData.get('externalVariantId') ?? ''),
  };
  try {
    await withCommerceService(operator.tenantId, async (service) => {
      await service.previewMappings(operator, connectionId, [mapping]);
      await service.applyMappings(operator, connectionId, [mapping]);
    });
    back();
  } catch (e) {
    back(e instanceof Error ? e.message : 'Could not apply the mapping.');
  }
}

export async function publishCommerceStockFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  try {
    await withCommerceService(operator.tenantId, (service) =>
      service.publishStock(operator, String(formData.get('connectionId') ?? '')),
    );
    back();
  } catch (e) {
    back(e instanceof Error ? e.message : 'Could not publish stock.');
  }
}

export async function testCommerceConnectionFromForm(formData: FormData) {
  const operator = await operatorFromSession();
  const token = String(formData.get('token') ?? '');
  try {
    const actor = await authenticateCommerceRequest(`Bearer ${token}`);
    if (actor.tenantId !== operator.tenantId) {
      back('That key belongs to another company.');
    }
    back();
  } catch (e) {
    back(e instanceof Error ? e.message : 'Connection test failed.');
  }
}
