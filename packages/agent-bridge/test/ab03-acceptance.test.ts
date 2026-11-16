import { describe, expect, it } from 'vitest';
import { AgentBridgeService, recordingPostingPort } from '../src/service';
import { MemoryStore } from '../src/store';
import { defaultPolicy, type Actor, type Capability } from '../src/contracts';
import { fixtureExtractor } from '../src/extraction';
import { dispatchTool } from '../src/mcp';
import { intersectCapabilities } from '../src/authz';

const owner: Actor = {
  tenantId: 'synthetic-company',
  userId: 'synthetic-owner',
  capabilities: ['read', 'upload', 'draft', 'approve', 'post'],
};

function liveGrants(userId: string): Capability[] {
  if (userId === 'synthetic-viewer') return ['read'];
  return ['read', 'upload', 'draft', 'approve', 'post'];
}

async function setup() {
  const store = new MemoryStore();
  await store.setFlags(owner.tenantId, { enabled: true, draftOnly: false, postingDisabled: false });
  const posting = recordingPostingPort();
  const authorizeActor = async (actor: Actor): Promise<Actor> => ({
    ...actor,
    capabilities: intersectCapabilities(actor.capabilities, liveGrants(actor.userId)),
  });
  const service = new AgentBridgeService({
    store,
    posting,
    extractor: fixtureExtractor,
    policyFor: async () => defaultPolicy(),
    authorizeActor,
  });
  const uploaded = await service.submitDocument(owner, {
    filename: 'synthetic.pdf',
    mime: 'application/pdf',
    bytes: new TextEncoder().encode('fixture:supported-vat-service'),
  });
  if (!uploaded.ok) throw new Error('fixture refused');
  const proposal = (await service.proposePurchaseBill(owner, uploaded.document!.id)) as { id: string; documentId: string };
  const approval = (await service.grantApproval(owner, proposal.id)) as { id: string };
  return { store, posting, service, authorizeActor, proposal, approval, documentId: uploaded.document!.id };
}

describe('independent acceptance expectations AB-03', () => {
  it('stale Viewer post scope is intersected away and creates zero bills', async () => {
    const { service, posting, proposal, approval } = await setup();
    const staleViewer: Actor = {
      tenantId: owner.tenantId,
      userId: 'synthetic-viewer',
      capabilities: ['read', 'post'],
      connectionId: 'stale-connection',
      clientId: 'stale-client',
    };
    const before = posting.posts.length;
    let refusal: unknown;
    try {
      refusal = await dispatchTool(service, staleViewer, 'commit_approved_proposal', {
        proposalId: proposal.id,
        approvalId: approval.id,
        idempotencyKey: 'synthetic-viewer-must-refuse',
      });
    } catch (e) {
      refusal = { error: (e as Error).message };
    }
    expect(posting.posts).toHaveLength(before);
    expect(refusal).not.toMatchObject({ status: 'posted' });
  });

  it('lost-response reconciliation updates receipt and document together without a second post', async () => {
    const { store, posting, service, proposal, approval, documentId } = await setup();
    const first = await service.commitApprovedProposal(owner, {
      proposalId: proposal.id,
      approvalId: approval.id,
      idempotencyKey: 'synthetic-once',
    });
    expect(first).toMatchObject({ status: 'posted' });
    expect(posting.posts).toHaveLength(1);
    const op = await store.findOperationForProposal(owner.tenantId, proposal.id);
    if (!op) throw new Error('missing operation');
    op.receipt = { ...op.receipt, status: 'unknown_outcome', error: 'injected crash' };
    await store.saveOperation(op);
    const doc = await store.getDocument(owner.tenantId, documentId);
    if (!doc) throw new Error('missing document');
    doc.status = 'unknown_outcome';
    await store.saveDocument(doc);

    const restarted = new AgentBridgeService({
      store,
      posting,
      extractor: fixtureExtractor,
      policyFor: async () => defaultPolicy(),
    });
    const receipt = await restarted.commitApprovedProposal(owner, {
      proposalId: proposal.id,
      approvalId: approval.id,
      idempotencyKey: 'synthetic-once',
    });
    expect(receipt).toMatchObject({ status: 'posted', billId: (first as { billId: string }).billId });
    expect((await store.getDocument(owner.tenantId, documentId))?.status).toBe('posted');
    expect(posting.posts).toHaveLength(1);
  });

  it('token scopes never expand past current grants', () => {
    expect(intersectCapabilities(['read', 'post'], ['read'])).toEqual(['read']);
    expect(intersectCapabilities(['read'], ['read', 'upload', 'draft', 'approve', 'post'])).toEqual(['read']);
  });
});
