import { describe, expect, it } from 'vitest';
import { defaultPolicy, type Actor } from '../src/contracts';
import { goldenById } from '../src/oracles';
import { MemoryStore } from '../src/store';
import { AgentBridgeService, recordingPostingPort } from '../src/service';
import { fixtureExtractor } from '../src/extraction';
import { dispatchTool } from '../src/mcp';
import { authorizationServerMetadata, protectedResourceMetadata } from '../src/oauth';

function actor(): Actor {
  return { userId: 'user-owner', tenantId: 'tenant-a', capabilities: ['read', 'upload', 'draft', 'approve', 'post'] };
}

async function serviceFor(posting = recordingPostingPort()) {
  const store = new MemoryStore();
  await store.setFlags('tenant-a', { enabled: true, draftOnly: false, postingDisabled: false });
  const svc = new AgentBridgeService({ store, extractor: fixtureExtractor, posting, policyFor: async () => defaultPolicy() });
  return { svc, store };
}

describe('QA-1126 retest (AgentBridge)', () => {
  it('QA-1126-01: both OAuth metadata documents publish the same requestable scopes', () => {
    const as = authorizationServerMetadata('https://bookone.example');
    const pr = protectedResourceMetadata('https://bookone.example', ['https://bookone.example']);
    expect(pr.scopes_supported).toEqual(as.scopes_supported);
  });

  it('QA-1126-07: the same bytes through MCP submit_document are refused without allowDuplicate', async () => {
    const { svc } = await serviceFor();
    const b64 = Buffer.from('fixture:qa-dup-mcp').toString('base64');
    const args = { filename: 'ab-inv-001.pdf', mime: 'application/pdf', contentBase64: b64 };
    const first = (await dispatchTool(svc, actor(), 'submit_document', args)) as { ok: boolean };
    expect(first.ok).toBe(true);
    const second = await dispatchTool(svc, actor(), 'submit_document', args);
    expect(second).toMatchObject({ ok: false, code: 'DUPLICATE_DOCUMENT' });
    const kept = await dispatchTool(svc, actor(), 'submit_document', { ...args, allowDuplicate: true });
    expect(kept).toMatchObject({ ok: true });
  });

  it('QA-1126-08: a refused post keeps its reason on the document', async () => {
    const posting = recordingPostingPort();
    const refusing = {
      ...posting,
      async commitPurchaseBill() {
        throw new Error('Duplicate bill: supplier invoice “ABC-2611-001” already on PUR-0001.');
      },
    };
    const { svc } = await serviceFor(refusing);
    const golden = goldenById('supported-vat-service');
    const submitted = await svc.submitDocument(actor(), {
      filename: 'abc.pdf',
      mime: 'application/pdf',
      bytes: new TextEncoder().encode('fixture:supported-vat-service'),
      textHint: golden.content,
    });
    if (!submitted.ok) throw new Error('submit failed');
    const docId = submitted.document!.id;
    const proposal = (await svc.proposePurchaseBill(actor(), docId)) as { id: string };
    await svc.validateProposal(actor(), proposal.id);
    await svc.getPreview(actor(), proposal.id);
    const approval = (await svc.grantApproval(actor(), proposal.id)) as { id: string };
    const receipt = await svc.commitApprovedProposal(actor(), {
      proposalId: proposal.id,
      approvalId: approval.id,
      idempotencyKey: 'qa-dup-bill',
    });
    expect(receipt).toMatchObject({ status: 'failed' });
    const status = await svc.getProcessingStatus(actor(), docId);
    expect(status.document.lastErrorMessage).toMatch(/Duplicate bill/);
  });

  it('QA-1126-11: an unsupported argument is INVALID_ARGUMENT, not STALE_REVISION', async () => {
    const { svc } = await serviceFor();
    const out = await dispatchTool(svc, actor(), 'lookup_suppliers', { query: 'ABC' });
    expect(out).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    const unknown = await dispatchTool(svc, actor(), 'no_such_tool', {});
    expect(unknown).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
  });
});
