import { describe, expect, it } from 'vitest';
import { AgentBridgeService, recordingPostingPort } from '../src/service';
import { MemoryStore } from '../src/store';
import { defaultPolicy, type Actor } from '../src/contracts';
import { parseMajorToMinor } from '../src/money';
import { encodeTenantBoundCode, tenantIdFromBoundToken, consentConnectionScopes } from '../src/oauth';

const actor: Actor = {
  userId: 'independent-owner',
  tenantId: 'independent-company',
  capabilities: ['read', 'upload', 'draft', 'approve', 'post'],
};

async function setup() {
  const store = new MemoryStore();
  await store.setFlags(actor.tenantId, { enabled: true, draftOnly: false, postingDisabled: false });
  const policy = defaultPolicy();
  policy.defaultExpenseAccount = '6800';
  policy.approvedCategories = [
    { label: 'Cost of Goods Sold', accountCode: '5000' },
    { label: 'General Expense', accountCode: '6800' },
  ];
  const posting = recordingPostingPort();
  const svc = new AgentBridgeService({
    store,
    posting,
    policyFor: async () => policy,
    extractor: {
      id: 'independent:no-ocr',
      async extract() {
        throw Error('not needed');
      },
    },
  });
  const upload = {
    filename: 'independent.pdf',
    mime: 'application/pdf',
    bytes: new TextEncoder().encode('%PDF-1.4\nIndependent synthetic source\n%%EOF'),
  };
  return { store, svc, upload, posting };
}

async function draft() {
  const s = await setup();
  const received = await s.svc.submitDocument(actor, s.upload);
  if (!received.ok || !received.document) throw Error('Fixture source was not stored');
  const facts = {
    documentId: received.document.id,
    contentHash: received.document.contentHash,
    expectedRevision: 0,
    supplierName: 'ABC Supplies',
    supplierInvoiceNumber: 'INDEPENDENT-001',
    issueDate: '2026-11-17',
    currency: 'LKR',
    paidStatus: 'unpaid' as const,
    documentKind: 'service_expense' as const,
    netMinor: 100000,
    taxMinor: 18000,
    grossMinor: 118000,
    expenseAccountCode: '6800',
    lineDescription: 'First description',
    idempotencyKey: 'facts-1',
  };
  const result = await s.svc.submitExtractedFacts(actor, facts);
  if (!result.ok) throw Error('Fixture facts were refused');
  return { ...s, facts, result };
}

describe('Independent AB05 contract and concurrency acceptance', () => {
  it('same logical upload concurrently stores exactly one document', async () => {
    const { svc, store, upload } = await setup();
    const results = await Promise.all([
      svc.submitDocument(actor, { ...upload, idempotencyKey: 'upload-one' }),
      svc.submitDocument(actor, { ...upload, idempotencyKey: 'upload-one' }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect((await store.listDocuments(actor.tenantId)).length).toBe(1);
  });

  it('facts idempotency rejects a changed line description', async () => {
    const { svc, facts } = await draft();
    const replay = await svc.submitExtractedFacts(actor, {
      ...facts,
      lineDescription: 'Different service evidence',
    });
    expect(replay).toMatchObject({ ok: false, code: 'IDEMPOTENCY_MISMATCH' });
  });

  it('selected expense account determines the displayed category label', async () => {
    const { result } = await draft();
    expect(result.proposal.facts.expenseAccountCode).toBe('6800');
    expect(result.proposal.facts.categoryLabel).toBe('General Expense');
  });

  it('editing approved facts returns a new reviewable revision and revokes prior approval', async () => {
    const { svc, store, facts, result } = await draft();
    await svc.validateProposal(actor, result.proposal.id);
    const approval = await svc.grantApproval(actor, result.proposal.id);
    if (!('id' in approval)) throw Error('Fixture approval unavailable');
    const changed = await svc.submitExtractedFacts(actor, {
      ...facts,
      idempotencyKey: 'facts-2',
      expectedRevision: result.document.proposalRevision,
      lineDescription: 'Corrected description',
    });
    expect(changed.ok).toBe(true);
    const old = await store.getApproval(actor.tenantId, approval.id);
    expect(old?.revokedAt).toBeTruthy();
  });

  it('a superseded proposal cannot reuse the old approval to invoke posting', async () => {
    const { svc, facts, result, posting } = await draft();
    const oldId = result.proposal.id;
    await svc.validateProposal(actor, oldId);
    const approval = await svc.grantApproval(actor, oldId);
    if (!('id' in approval)) throw Error('Fixture approval unavailable');
    await svc.validateProposal(actor, oldId);
    const corrected = await svc.submitExtractedFacts(actor, {
      ...facts,
      idempotencyKey: 'new-correction',
      expectedRevision: 1,
      netMinor: 200000,
      taxMinor: 36000,
      grossMinor: 236000,
    });
    if (!corrected.ok) throw Error('Fixture correction was refused');
    expect(corrected.document.proposalId).not.toBe(oldId);
    await svc.requestApproval(actor, oldId);
    const receipt = await svc.commitApprovedProposal(actor, {
      proposalId: oldId,
      approvalId: approval.id,
      idempotencyKey: 'superseded-post',
    });
    expect(receipt).not.toMatchObject({ status: 'posted' });
    expect(posting.posts.length).toBe(0);
  });
});

describe('AB-06 adjacent repairs', () => {
  it('rejects an inconsistent category code/label pair', async () => {
    const { svc, upload } = await setup();
    const received = await svc.submitDocument(actor, upload);
    if (!received.ok || !received.document) throw Error('upload failed');
    const refused = await svc.submitExtractedFacts(actor, {
      documentId: received.document.id,
      contentHash: received.document.contentHash,
      expectedRevision: 0,
      supplierName: 'ABC Supplies',
      supplierInvoiceNumber: 'INDEPENDENT-002',
      issueDate: '2026-11-17',
      currency: 'LKR',
      paidStatus: 'unpaid',
      documentKind: 'service_expense',
      netMinor: 100000,
      taxMinor: 18000,
      grossMinor: 118000,
      expenseAccountCode: '6800',
      categoryLabel: 'Cost of Goods Sold',
      lineDescription: 'Mismatch',
      idempotencyKey: 'facts-mismatch-cat',
    });
    expect(refused).toMatchObject({ ok: false, code: 'AMBIGUOUS_CATEGORY' });
  });

  it('finalizes a browser upload against the same session without a second document', async () => {
    const { svc, store, upload } = await setup();
    const session = await svc.createUploadSession(actor, {
      filename: upload.filename,
      mime: upload.mime,
      requestKey: 'session-one',
    });
    if (!('sessionId' in session)) throw Error('session missing');
    const human: Actor = { ...actor, connectionId: undefined };
    const first = await svc.finalizeUploadSession(human, { sessionId: session.sessionId, bytes: upload.bytes });
    const second = await svc.finalizeUploadSession(human, { sessionId: session.sessionId, bytes: upload.bytes });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect((await store.listDocuments(actor.tenantId)).length).toBe(1);
  });

  it('rejects blank, malformed, negative and over-precise amounts', () => {
    expect(parseMajorToMinor('')).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    expect(parseMajorToMinor('abc')).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    expect(parseMajorToMinor('-1.00')).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    expect(parseMajorToMinor('1.234')).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    expect(parseMajorToMinor('1000.00')).toEqual({ ok: true, minor: 100000 });
  });

  it('encodes tenant identity in authorization and refresh codes', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const code = encodeTenantBoundCode(tenantId);
    const refresh = encodeTenantBoundCode(tenantId, 'refresh');
    expect(tenantIdFromBoundToken(code)).toBe(tenantId);
    expect(tenantIdFromBoundToken(refresh)).toBe(tenantId);
    expect(refresh.startsWith('rt.')).toBe(true);
    expect(consentConnectionScopes()).toEqual(['read', 'upload', 'draft']);
  });

  it('different upload keys store two documents', async () => {
    const { svc, store, upload } = await setup();
    await svc.submitDocument(actor, { ...upload, idempotencyKey: 'upload-a' });
    await svc.submitDocument(actor, {
      ...upload,
      bytes: new TextEncoder().encode('%PDF-1.4\nSecond independent source\n%%EOF'),
      idempotencyKey: 'upload-b',
    });
    expect((await store.listDocuments(actor.tenantId)).length).toBe(2);
  });
});
