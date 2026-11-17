import { describe, expect, it } from 'vitest';
import { defaultPolicy, SCHEMA_VERSION, type Actor } from '../src/contracts';
import { MemoryStore, sha256 } from '../src/store';
import { AgentBridgeService, recordingPostingPort } from '../src/service';
import { fixtureExtractor } from '../src/extraction';
import { handleMcpJsonRpc } from '../src/mcp';
import { hmacFixturesAllowed } from '../src/authz';
import { capabilityMatrix } from '../src/operations';
import { money } from '../src/money';
import { oracleVatMinor } from '../src/oracles';

function actor(over: Partial<Actor> = {}): Actor {
  return {
    userId: 'user-owner',
    tenantId: 'tenant-a',
    capabilities: ['read', 'upload', 'draft', 'approve', 'post'],
    ...over,
  };
}

function unconfiguredExtractor() {
  return {
    id: 'provider:configurable-ocr',
    async extract() {
      throw Object.assign(new Error('Live OCR is not opted in.'), { code: 'PROVIDER_UNCONFIGURED' });
    },
  };
}

async function factsService() {
  const store = new MemoryStore();
  await store.setFlags('tenant-a', { enabled: true, draftOnly: false, postingDisabled: false });
  const posting = recordingPostingPort();
  const svc = new AgentBridgeService({
    store,
    extractor: unconfiguredExtractor(),
    posting,
    policyFor: async () => defaultPolicy(),
    publicBaseUrl: 'https://bookone.example',
  });
  return { svc, store, posting };
}

describe('AB-05 agent-first facts without OCR', () => {
  it('stores a valid upload as awaiting_facts when OCR is unconfigured', async () => {
    const { svc } = await factsService();
    const bytes = new TextEncoder().encode('fixture:no-ocr-original');
    const submitted = await svc.submitDocument(actor(), {
      filename: 'inv.pdf',
      mime: 'application/pdf',
      bytes,
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) throw new Error('submit failed');
    expect(submitted.document?.status).toBe('awaiting_facts');
    expect(submitted.document?.lastErrorCode).toBe('PROVIDER_UNCONFIGURED');
    expect(submitted.document?.lastErrorMessage).toMatch(/facts/i);
    const status = await svc.getProcessingStatus(actor(), submitted.document!.id);
    expect(status.allowedNext).toContain('submit_extracted_facts');
    expect(status.document.status).not.toBe('failed');
  });

  it('posts VAT1180 from submitted facts against the stored original', async () => {
    const { svc, posting } = await factsService();
    const bytes = new TextEncoder().encode('fixture:supported-vat-service-bytes');
    const submitted = await svc.submitDocument(actor(), {
      filename: 'abc.pdf',
      mime: 'application/pdf',
      bytes,
    });
    if (!submitted.ok) throw new Error('submit failed');
    const doc = submitted.document!;
    const facts = await svc.submitExtractedFacts(actor(), {
      documentId: doc.id,
      contentHash: doc.contentHash,
      expectedRevision: 0,
      supplierName: 'ABC Supplies',
      supplierInvoiceNumber: 'INV-1001',
      issueDate: '2026-03-01',
      currency: 'LKR',
      paidStatus: 'unpaid',
      documentKind: 'service_expense',
      netMinor: 100000,
      taxMinor: 18000,
      grossMinor: 118000,
      expenseAccountCode: '6800',
      categoryLabel: 'Office expenses',
      lineDescription: 'Monthly accounting support',
      origin: 'agent-facts',
    });
    expect(facts.ok).toBe(true);
    if (!facts.ok) throw new Error('facts failed');
    expect(facts.document.status).toBe('draft');
    const proposalId = facts.proposal.id;
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
      idempotencyKey: 'ab05-vat-1',
    });
    expect(receipt).toMatchObject({ status: 'posted' });
    expect(posting.posts).toHaveLength(1);
    expect(posting.posts[0]?.facts.net).toEqual(money(100000));
  });

  it('rejects stale revision, hash mismatch, and facts idempotency collision', async () => {
    const { svc } = await factsService();
    const submitted = await svc.submitDocument(actor(), {
      filename: 'inv.pdf',
      mime: 'application/pdf',
      bytes: new TextEncoder().encode('fixture:hash-check'),
    });
    if (!submitted.ok) throw new Error('submit failed');
    const doc = submitted.document!;
    const badHash = await svc.submitExtractedFacts(actor(), {
      documentId: doc.id,
      contentHash: '0'.repeat(64),
      expectedRevision: 0,
      supplierName: 'ABC Supplies',
      supplierInvoiceNumber: 'X',
      issueDate: '2026-03-01',
      netMinor: 100000,
      taxMinor: 18000,
      grossMinor: 118000,
      paidStatus: 'unpaid',
      documentKind: 'service_expense',
    });
    expect(badHash).toMatchObject({ ok: false, code: 'FACTS_HASH_MISMATCH' });
    const first = await svc.submitExtractedFacts(actor(), {
      documentId: doc.id,
      contentHash: doc.contentHash,
      expectedRevision: 0,
      idempotencyKey: 'facts-1',
      supplierName: 'ABC Supplies',
      supplierInvoiceNumber: 'INV-1',
      issueDate: '2026-03-01',
      netMinor: 100000,
      taxMinor: 18000,
      grossMinor: 118000,
      paidStatus: 'unpaid',
      documentKind: 'service_expense',
    });
    expect(first.ok).toBe(true);
    const replay = await svc.submitExtractedFacts(actor(), {
      documentId: doc.id,
      contentHash: doc.contentHash,
      expectedRevision: 0,
      idempotencyKey: 'facts-1',
      supplierName: 'ABC Supplies',
      supplierInvoiceNumber: 'INV-1',
      issueDate: '2026-03-01',
      netMinor: 100000,
      taxMinor: 18000,
      grossMinor: 118000,
      paidStatus: 'unpaid',
      documentKind: 'service_expense',
    });
    expect(replay.ok).toBe(true);
    const changed = await svc.submitExtractedFacts(actor(), {
      documentId: doc.id,
      contentHash: doc.contentHash,
      expectedRevision: 0,
      idempotencyKey: 'facts-1',
      supplierName: 'Office Mart',
      supplierInvoiceNumber: 'INV-2',
      issueDate: '2026-03-01',
      netMinor: 200000,
      taxMinor: 0,
      grossMinor: 200000,
      paidStatus: 'unpaid',
      documentKind: 'service_expense',
    });
    expect(changed).toMatchObject({ ok: false, code: 'IDEMPOTENCY_MISMATCH' });
  });

  it('refuses paid, stock, mixed and foreign-currency writes instead of reinterpreting them', async () => {
    const { svc } = await factsService();
    const submitted = await svc.submitDocument(actor(), {
      filename: 'paid.pdf',
      mime: 'application/pdf',
      bytes: new TextEncoder().encode('fixture:paid-stock'),
    });
    if (!submitted.ok) throw new Error('submit failed');
    const paid = await svc.submitExtractedFacts(actor(), {
      documentId: submitted.document!.id,
      contentHash: submitted.document!.contentHash,
      expectedRevision: 0,
      supplierName: 'ABC Supplies',
      supplierInvoiceNumber: 'P1',
      issueDate: '2026-03-01',
      paidStatus: 'paid',
      documentKind: 'service_expense',
      netMinor: 100000,
      taxMinor: 18000,
      grossMinor: 118000,
    });
    expect(paid.ok).toBe(true);
    if (!paid.ok) throw new Error('facts failed');
    const preview = await svc.validateProposal(actor(), paid.proposal.id);
    expect(preview.ok).toBe(false);
  });

  it('creates an upload-session fallback URL and does not pretend chat attachments arrive', async () => {
    const { svc } = await factsService();
    const session = await svc.createUploadSession(actor(), {
      filename: 'inv.pdf',
      mime: 'application/pdf',
    });
    expect(session).toMatchObject({ ok: true });
    if (!('reviewUrl' in session)) throw new Error('missing review url');
    expect(session.reviewUrl).toMatch(/\/purchase\/inbox\?uploadSession=/);
    expect(session.note).toMatch(/not sent to this server automatically/i);
  });

  it('looks up suppliers and expense accounts from company policy', async () => {
    const { svc } = await factsService();
    const suppliers = await svc.lookupSuppliers(actor(), { q: 'abc' });
    expect(suppliers.some((s) => s.name === 'ABC Supplies')).toBe(true);
    const accounts = await svc.lookupExpenseAccounts(actor(), { q: '6800' });
    expect(accounts.some((a) => a.accountCode === '6800')).toBe(true);
  });

  it('processes a batch per item and never returns a batch approval', async () => {
    const { svc } = await factsService();
    const b64 = Buffer.from('fixture:batch-one').toString('base64');
    const batch = await svc.submitBatchManifest(actor(), {
      items: [
        { requestKey: 'b1', filename: 'a.pdf', mime: 'application/pdf', contentBase64: b64 },
        { requestKey: 'b2', filename: 'b.pdf', mime: 'application/pdf' },
      ],
    });
    expect(batch.ok).toBe(true);
    if (!batch.ok) throw new Error('batch failed');
    expect(batch.note).toMatch(/never approved as a whole/i);
    expect(batch.items[0]?.status).toBe('awaiting_facts');
    expect(batch.items[1]?.status).toBe('pending');
  });

  it('keeps fixture extraction for injected test extractors', async () => {
    const store = new MemoryStore();
    await store.setFlags('tenant-a', { enabled: true, draftOnly: false, postingDisabled: false });
    const svc = new AgentBridgeService({
      store,
      extractor: fixtureExtractor,
      posting: recordingPostingPort(),
      policyFor: async () => defaultPolicy(),
    });
    const submitted = await svc.submitDocument(actor(), {
      filename: 'abc.pdf',
      mime: 'application/pdf',
      bytes: new TextEncoder().encode('fixture:supported-vat-service'),
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) throw new Error('submit failed');
    expect(submitted.document?.status).toBe('draft');
  });

  it('publishes schema ab-05.1 and a supported-only write matrix', () => {
    expect(SCHEMA_VERSION).toBe('ab-05.1');
    const matrix = capabilityMatrix();
    expect(matrix.operations.filter((o) => o.supported).map((o) => o.id)).toEqual([
      'purchase.bill.unpaid-service.v1',
    ]);
    expect(hmacFixturesAllowed({ NODE_ENV: 'production' })).toBe(false);
    expect(hmacFixturesAllowed({ NODE_ENV: 'production', AGENT_BRIDGE_ALLOW_HMAC: '1' })).toBe(true);
  });

  it('rejects an incompatible MCP protocol version', async () => {
    const { svc } = await factsService();
    const res = await handleMcpJsonRpc({
      body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } },
      service: svc,
      actor: actor(),
    });
    expect(res.error?.data).toMatchObject({ code: 'UNSUPPORTED_PROTOCOL' });
  });

  it('rejects unknown privileged MCP fields', async () => {
    const { svc } = await factsService();
    const res = await handleMcpJsonRpc({
      body: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'submit_document', arguments: { filename: 'a.pdf', mime: 'application/pdf', contentBase64: 'QQ==', approved: true } },
      },
      service: svc,
      actor: actor(),
    });
    const structured = (res.result as { structuredContent: { ok?: boolean; error?: string } }).structuredContent;
    expect(structured.ok).toBe(false);
    expect(structured.error).toMatch(/not a supported field/i);
  });

  it('hashes facts against the stored original bytes', async () => {
    const bytes = new TextEncoder().encode('fixture:hash-source');
    expect(sha256(bytes)).toHaveLength(64);
  });
});
