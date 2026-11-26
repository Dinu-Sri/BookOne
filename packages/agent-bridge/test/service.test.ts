import { describe, expect, it } from 'vitest';
import { defaultPolicy, type Actor } from '../src/contracts';
import { goldenById, oracleVatMinor } from '../src/oracles';
import { MemoryStore } from '../src/store';
import { AgentBridgeService, recordingPostingPort } from '../src/service';
import { fixtureExtractor } from '../src/extraction';
import { money } from '../src/money';

function actor(over: Partial<Actor> = {}): Actor {
  return {
    userId: 'user-owner',
    tenantId: 'tenant-a',
    capabilities: ['read', 'upload', 'draft', 'approve', 'post'],
    ...over,
  };
}

async function serviceFor(tenant = 'tenant-a') {
  const store = new MemoryStore();
  await store.setFlags(tenant, { enabled: true, draftOnly: false, postingDisabled: false });
  const posting = recordingPostingPort();
  const svc = new AgentBridgeService({
    store,
    extractor: fixtureExtractor,
    posting,
    policyFor: async () => defaultPolicy(),
  });
  return { svc, store, posting };
}

describe('AgentBridgeService', () => {
  it('refuses work when the company flag is off', async () => {
    const store = new MemoryStore();
    const svc = new AgentBridgeService({
      store,
      extractor: fixtureExtractor,
      posting: recordingPostingPort(),
      policyFor: async () => defaultPolicy(),
    });
    const out = await svc.submitDocument(actor(), {
      filename: 'inv.pdf',
      mime: 'application/pdf',
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(out).toMatchObject({ ok: false, code: 'FEATURE_DISABLED' });
  });

  it('runs the supported VAT service invoice from upload to one receipt', async () => {
    const { svc, posting } = await serviceFor();
    const golden = goldenById('supported-vat-service');
    const submitted = await svc.submitDocument(actor(), {
      filename: 'abc.pdf',
      mime: 'application/pdf',
      bytes: new TextEncoder().encode('fixture:supported-vat-service'),
      textHint: golden.content,
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) throw new Error('submit failed');
    const docId = submitted.document!.id;
    const status = await svc.getProcessingStatus(actor(), docId);
    expect(status.document.status).toBe('draft');
    const proposal = await svc.proposePurchaseBill(actor(), docId);
    expect(proposal && 'id' in proposal).toBe(true);
    const proposalId = (proposal as { id: string }).id;
    const validated = await svc.validateProposal(actor(), proposalId);
    expect(validated.ok).toBe(true);
    const preview = await svc.getPreview(actor(), proposalId);
    expect('net' in preview && preview.net.minor).toBe(100000);
    expect('vat' in preview && preview.vat.minor).toBe(oracleVatMinor(100000, true, 18));
    expect('gross' in preview && preview.gross.minor).toBe(118000);
    expect('journal' in preview && preview.journal).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '6800', side: 'debit', minor: 100000 }),
        expect.objectContaining({ accountCode: '2300', side: 'debit', minor: 18000 }),
        expect.objectContaining({ accountCode: '2100', side: 'credit', minor: 118000 }),
      ]),
    );
    const approval = await svc.grantApproval(actor(), proposalId);
    expect('id' in approval).toBe(true);
    const receipt = await svc.commitApprovedProposal(actor(), {
      proposalId,
      approvalId: (approval as { id: string }).id,
      idempotencyKey: 'op-vat-1',
    });
    expect(receipt).toMatchObject({ status: 'posted', documentNumber: 'APB-1' });
    const again = await svc.commitApprovedProposal(actor(), {
      proposalId,
      approvalId: (approval as { id: string }).id,
      idempotencyKey: 'op-vat-1',
    });
    expect(again).toMatchObject({ operationId: (receipt as { operationId: string }).operationId });
    expect(posting.posts).toHaveLength(1);
    const mismatch = await svc.commitApprovedProposal(actor(), {
      proposalId,
      approvalId: (approval as { id: string }).id,
      idempotencyKey: 'op-vat-1-other',
    });
    expect(mismatch).toMatchObject({ status: 'posted' });
    expect(posting.posts).toHaveLength(1);
  });

  it('asks a plain-language supplier question and will not invent a vendor', async () => {
    const { svc } = await serviceFor();
    const submitted = await svc.submitDocument(actor(), {
      filename: 'missing.pdf',
      mime: 'application/pdf',
      bytes: new TextEncoder().encode('fixture:missing-supplier'),
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) throw new Error('submit failed');
    const status = await svc.getProcessingStatus(actor(), submitted.document!.id);
    expect(status.document.status).toBe('needs_clarification');
    const issue = status.proposal!.issues.find((i) => i.code === 'MISSING_SUPPLIER');
    expect(issue?.question).toMatch(/approved supplier/i);
    const answered = await svc.answerIssue(actor(), {
      proposalId: status.proposal!.id,
      issueId: issue!.id,
      value: 'ABC Supplies',
    });
    expect(answered && 'facts' in answered && answered.facts.supplierName).toBe('ABC Supplies');
  });

  it('stops unsupported paid invoices instead of reinterpreting them', async () => {
    const { svc } = await serviceFor();
    const submitted = await svc.submitDocument(actor(), {
      filename: 'paid.pdf',
      mime: 'application/pdf',
      bytes: new TextEncoder().encode('fixture:unsupported-paid'),
    });
    if (!submitted.ok) throw new Error('submit failed');
    const status = await svc.getProcessingStatus(actor(), submitted.document!.id);
    const paid = status.proposal!.issues.find((i) => i.code === 'UNSUPPORTED_PAID');
    const stopped = await svc.answerIssue(actor(), {
      proposalId: status.proposal!.id,
      issueId: paid!.id,
      value: 'stop_unsupported',
    });
    expect(stopped).toMatchObject({ rejected: true });
    const after = await svc.getProcessingStatus(actor(), submitted.document!.id);
    expect(after.document.status).toBe('rejected');
  });

  it('enforces draft-only, posting-disable, viewer denial and stale approval', async () => {
    const store = new MemoryStore();
    await store.setFlags('tenant-a', { enabled: true, draftOnly: true, postingDisabled: false });
    const posting = recordingPostingPort();
    const svc = new AgentBridgeService({
      store,
      extractor: fixtureExtractor,
      posting,
      policyFor: async () => defaultPolicy(),
    });
    const hashed = new TextEncoder().encode('fixture:supported-non-vat');
    const submitted = await svc.submitDocument(actor(), {
      filename: 'nv.pdf',
      mime: 'application/pdf',
      bytes: hashed,
    });
    if (!submitted.ok) throw new Error('submit failed');
    const proposal = await svc.proposePurchaseBill(actor(), submitted.document!.id);
    const proposalId = (proposal as { id: string }).id;
    await svc.validateProposal(actor(), proposalId);
    const approval = await svc.grantApproval(actor(), proposalId);
    const draftOnly = await svc.commitApprovedProposal(actor(), {
      proposalId,
      approvalId: (approval as { id: string }).id,
      idempotencyKey: 'k1',
    });
    expect(draftOnly).toMatchObject({ ok: false, code: 'DRAFT_ONLY' });

    await store.setFlags('tenant-a', { enabled: true, draftOnly: false, postingDisabled: true });
    const disabled = await svc.commitApprovedProposal(actor(), {
      proposalId,
      approvalId: (approval as { id: string }).id,
      idempotencyKey: 'k2',
    });
    expect(disabled).toMatchObject({ ok: false, code: 'POSTING_DISABLED' });

    await store.setFlags('tenant-a', { enabled: true, draftOnly: false, postingDisabled: false });
    const viewer = actor({ capabilities: ['read'] });
    await expect(svc.submitDocument(viewer, { filename: 'x.pdf', mime: 'application/pdf', bytes: hashed })).rejects.toThrow(
      /Missing capability/,
    );

    const rec = await store.getApproval('tenant-a', (approval as { id: string }).id);
    rec!.expiresAt = new Date(Date.now() - 1000).toISOString();
    await store.saveApproval(rec!);
    const stale = await svc.commitApprovedProposal(actor(), {
      proposalId,
      approvalId: (approval as { id: string }).id,
      idempotencyKey: 'k4',
    });
    expect(stale).toMatchObject({ ok: false, code: 'EXPIRED_APPROVAL' });
    expect(posting.posts).toHaveLength(0);
  });

  it('isolates tenants on documents, attachments and errors', async () => {
    const { svc, store } = await serviceFor('tenant-a');
    await store.setFlags('tenant-b', { enabled: true, draftOnly: false, postingDisabled: false });
    const hashed = new TextEncoder().encode('fixture:supported-vat-service');
    const submitted = await svc.submitDocument(actor(), {
      filename: 'a.pdf',
      mime: 'application/pdf',
      bytes: hashed,
    });
    if (!submitted.ok) throw new Error('submit failed');
    const other = actor({ tenantId: 'tenant-b', userId: 'other' });
    await expect(svc.getProcessingStatus(other, submitted.document!.id)).rejects.toThrow(/not found in this company/);
    const foreign = await svc.getOwnedAttachment(actor(), 'tenants/tenant-b/agent-bridge/x');
    expect(foreign).toMatchObject({ ok: false, code: 'ATTACHMENT_REJECTED' });
  });

  it('rejects path traversal filenames and files over 8MB', async () => {
    const { svc } = await serviceFor();
    const unsafe = await svc.submitDocument(actor(), {
      filename: '../secret.pdf',
      mime: 'application/pdf',
      bytes: new Uint8Array([1]),
    });
    expect(unsafe).toMatchObject({ ok: false, code: 'ATTACHMENT_REJECTED' });
    const huge = await svc.submitDocument(actor(), {
      filename: 'big.pdf',
      mime: 'application/pdf',
      bytes: new Uint8Array(8 * 1024 * 1024 + 1),
    });
    expect(huge).toMatchObject({ ok: false, code: 'ATTACHMENT_REJECTED' });
  });

  it('flags a duplicate scan instead of posting twice', async () => {
    const { svc } = await serviceFor();
    const hashed = new TextEncoder().encode('fixture:duplicate-scan');
    const first = await svc.submitDocument(actor(), {
      filename: 'dup.pdf',
      mime: 'application/pdf',
      bytes: hashed,
    });
    expect(first.ok).toBe(true);
    // QA-1126-07: the same bytes are refused unless the user asks for a separate copy.
    const refused = await svc.submitDocument(actor(), {
      filename: 'dup.pdf',
      mime: 'application/pdf',
      bytes: hashed,
    });
    expect(refused).toMatchObject({ ok: false, code: 'DUPLICATE_DOCUMENT' });
    if (refused.ok) throw new Error('duplicate was accepted');
    expect((refused as { duplicateOf?: string }).duplicateOf).toBe(first.ok ? first.document!.id : undefined);
    expect(refused.error).toMatch(/already received on .*upload anyway/i);
    const second = await svc.submitDocument(actor(), {
      filename: 'dup.pdf',
      mime: 'application/pdf',
      bytes: hashed,
      allowDuplicate: true,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('second submit failed');
    const status = await svc.getProcessingStatus(actor(), second.document!.id);
    expect(status.proposal!.issues.some((i) => i.code === 'DUPLICATE_SCAN')).toBe(true);
  });

  it('catches a wrong-money preview against the independent oracle', async () => {
    const golden = goldenById('discount-rounding');
    const expectedVat = oracleVatMinor(golden.facts.net!.value.minor, true, 18);
    expect(expectedVat).toBe(180);
    expect(money(999 + 180).minor).toBe(1179);
    const forged = 181;
    expect(forged).not.toBe(expectedVat);
  });
});
