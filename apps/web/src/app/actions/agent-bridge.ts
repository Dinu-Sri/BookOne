'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@bookone/auth';
import { withTenantContext } from '@bookone/db';
import { assertPermission } from '@/lib/access';
import {
  actorFromSession,
  getAgentBridgeService,
  loadAgentBridgeFlags,
  saveAgentBridgeFlags,
} from '@/lib/agent-bridge-runtime';
import { mintLocalFixtureToken, parseMajorToMinor, parseScopes } from '@bookone/agent-bridge';
import { agentBridgeTokenSecret } from '@/lib/agent-bridge-runtime';

export async function submitInboxFacts(formData: FormData) {
  await assertPermission('purchase.inbox.write', 'write');
  const user = await requireTenantContext();
  const { service, actor } = await withTenantContext(user.tenantId, () => getAgentBridgeService());
  const documentId = String(formData.get('documentId') ?? '');
  const net = parseMajorToMinor(String(formData.get('net') ?? ''));
  const taxRaw = String(formData.get('tax') ?? '').trim();
  const grossRaw = String(formData.get('gross') ?? '').trim();
  const tax = taxRaw ? parseMajorToMinor(taxRaw) : { ok: true as const, minor: 0 };
  const gross = grossRaw ? parseMajorToMinor(grossRaw) : net.ok ? { ok: true as const, minor: net.minor } : net;
  if (!net.ok) redirect(`/purchase/inbox/${documentId}?err=${encodeURIComponent(net.error)}`);
  if (!tax.ok) redirect(`/purchase/inbox/${documentId}?err=${encodeURIComponent(tax.error)}`);
  if (!gross.ok) redirect(`/purchase/inbox/${documentId}?err=${encodeURIComponent(gross.error)}`);
  const rawCategory = String(formData.get('expenseAccountCode') ?? '');
  const pipe = rawCategory.indexOf('|');
  const expenseAccountCode = (pipe >= 0 ? rawCategory.slice(0, pipe) : rawCategory) || undefined;
  const categoryLabel =
    (pipe >= 0 ? rawCategory.slice(pipe + 1) : String(formData.get('categoryLabel') ?? '')) || undefined;
  const result = await service.submitExtractedFacts(actor, {
    documentId,
    contentHash: String(formData.get('contentHash') ?? ''),
    expectedRevision: Number(formData.get('expectedRevision') ?? 0),
    supplierName: String(formData.get('supplierName') ?? ''),
    supplierInvoiceNumber: String(formData.get('supplierInvoiceNumber') ?? ''),
    issueDate: String(formData.get('issueDate') ?? ''),
    currency: String(formData.get('currency') ?? '') || undefined,
    paidStatus: (String(formData.get('paidStatus') ?? 'unpaid') as 'unpaid' | 'paid' | 'part_paid' | 'unknown'),
    documentKind: (String(formData.get('documentKind') ?? 'service_expense') as
      | 'service_expense'
      | 'stock'
      | 'mixed'
      | 'unknown'),
    netMinor: net.minor,
    taxMinor: tax.minor,
    grossMinor: gross.minor,
    expenseAccountCode,
    categoryLabel,
    lineDescription: String(formData.get('lineDescription') ?? '') || undefined,
    origin: 'manual',
  });
  if (result && 'ok' in result && result.ok === false) {
    redirect(`/purchase/inbox/${documentId}?err=${encodeURIComponent(result.error)}`);
  }
  revalidatePath(`/purchase/inbox/${documentId}`);
  redirect(`/purchase/inbox/${documentId}`);
}

export async function retryInboxExtraction(formData: FormData) {
  await assertPermission('purchase.inbox.write', 'write');
  const user = await requireTenantContext();
  const { service, actor } = await withTenantContext(user.tenantId, () => getAgentBridgeService());
  const documentId = String(formData.get('documentId') ?? '');
  await service.processDocument(actor, documentId);
  revalidatePath(`/purchase/inbox/${documentId}`);
  redirect(`/purchase/inbox/${documentId}`);
}

export async function revokeAgentConnection(formData: FormData) {
  await assertPermission('purchase.inbox.write', 'write');
  const user = await requireTenantContext();
  const id = String(formData.get('connectionId') ?? '');
  const { revokeAgentBridgeConnection } = await import('@/lib/agent-bridge-runtime');
  await withTenantContext(user.tenantId, () => revokeAgentBridgeConnection(user.tenantId, user.id, id));
  revalidatePath('/purchase/inbox/connections');
  redirect('/purchase/inbox/connections');
}

export async function uploadInboxDocument(formData: FormData) {
  await assertPermission('purchase.inbox.write', 'write');
  const user = await requireTenantContext();
  const { service, actor } = await withTenantContext(user.tenantId, () => getAgentBridgeService());
  const file = formData.get('file');
  if (!(file instanceof File)) {
    redirect('/purchase/inbox?err=Choose%20a%20PDF%20or%20image');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sessionId = String(formData.get('uploadSession') ?? '').trim();
  const result = sessionId
    ? await service.finalizeUploadSession(actor, { sessionId, bytes })
    : await service.submitDocument(actor, {
        filename: file.name,
        mime: file.type || 'application/pdf',
        bytes,
        textHint: String(formData.get('textHint') ?? ''),
      });
  if (!result.ok) {
    redirect(`/purchase/inbox?err=${encodeURIComponent(result.error)}`);
  }
  revalidatePath('/purchase/inbox');
  redirect(`/purchase/inbox/${result.document!.id}`);
}

export async function answerInboxIssue(formData: FormData) {
  await assertPermission('purchase.inbox.write', 'write');
  const user = await requireTenantContext();
  const { service, actor } = await withTenantContext(user.tenantId, () => getAgentBridgeService());
  await service.answerIssue(actor, {
    proposalId: String(formData.get('proposalId') ?? ''),
    issueId: String(formData.get('issueId') ?? ''),
    value: String(formData.get('value') ?? ''),
  });
  const documentId = String(formData.get('documentId') ?? '');
  revalidatePath(`/purchase/inbox/${documentId}`);
  redirect(`/purchase/inbox/${documentId}`);
}

export async function previewInboxProposal(formData: FormData) {
  await assertPermission('purchase.inbox.read', 'read');
  const user = await requireTenantContext();
  const { service, actor } = await withTenantContext(user.tenantId, () => getAgentBridgeService());
  const proposalId = String(formData.get('proposalId') ?? '');
  await service.validateProposal(actor, proposalId);
  await service.getPreview(actor, proposalId);
  const documentId = String(formData.get('documentId') ?? '');
  revalidatePath(`/purchase/inbox/${documentId}`);
  redirect(`/purchase/inbox/${documentId}`);
}

export async function approveInboxProposal(formData: FormData) {
  await assertPermission('agent_bridge.approve', 'write');
  const user = await requireTenantContext();
  const { service, actor } = await withTenantContext(user.tenantId, () => getAgentBridgeService());
  await service.grantApproval(actor, String(formData.get('proposalId') ?? ''));
  const documentId = String(formData.get('documentId') ?? '');
  revalidatePath(`/purchase/inbox/${documentId}`);
  redirect(`/purchase/inbox/${documentId}`);
}

export async function commitInboxProposal(formData: FormData) {
  await assertPermission('agent_bridge.post', 'write');
  const user = await requireTenantContext();
  const { service, actor } = await withTenantContext(user.tenantId, () => getAgentBridgeService());
  const receipt = await service.commitApprovedProposal(actor, {
    proposalId: String(formData.get('proposalId') ?? ''),
    approvalId: String(formData.get('approvalId') ?? ''),
    idempotencyKey: String(formData.get('idempotencyKey') ?? `ab-${crypto.randomUUID()}`),
  });
  const documentId = String(formData.get('documentId') ?? '');
  revalidatePath('/purchase/inbox');
  revalidatePath('/purchase/purchases');
  if (receipt && 'ok' in receipt && receipt.ok === false) {
    redirect(`/purchase/inbox/${documentId}?err=${encodeURIComponent(receipt.error)}`);
  }
  redirect(`/purchase/inbox/${documentId}`);
}

export async function saveAgentBridgeSettingsFromForm(formData: FormData) {
  await assertPermission('company.purchase_settings.write', 'write');
  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, () =>
    saveAgentBridgeFlags(user.tenantId, {
      enabled: formData.get('agentBridgeEnabled') === 'on' || formData.get('agentBridgeEnabled') === '1',
      draftOnly: formData.get('agentBridgeDraftOnly') === 'on' || formData.get('agentBridgeDraftOnly') === '1',
      postingDisabled:
        formData.get('agentBridgePostingDisabled') === 'on' || formData.get('agentBridgePostingDisabled') === '1',
    }),
  );
  revalidatePath('/company/purchase');
  revalidatePath('/purchase/inbox');
}

export async function mintInboxToken(): Promise<{ token?: string; error?: string }> {
  await assertPermission('company.purchase_settings.write', 'write');
  const actor = await actorFromSession();
  const flags = await loadAgentBridgeFlags(actor.tenantId);
  if (!flags.enabled) return { error: 'Turn on Document Inbox before minting a local token.' };
  const token = mintLocalFixtureToken({
    tenantId: actor.tenantId,
    userId: actor.userId,
    scopes: actor.capabilities.length ? actor.capabilities : parseScopes(['purchase.inbox.write']),
    secret: agentBridgeTokenSecret(),
    hours: 8,
  });
  return { token };
}
