import type {
  Actor,
  Capability,
  CompanyPolicy,
  FeatureFlags,
  OperationReceipt,
  PreviewEffect,
  ProposalFacts,
} from './contracts';
import { SCHEMA_VERSION } from './contracts';
import { money } from './money';
import { blockingIssues, issuesFromExtraction, issuesFromProposal } from './issues';
import { assertTransition } from './state';
import { calculatePreview, proposalHash } from './preview';
import { fixtureExtractor, type ExtractionProvider } from './extraction';
import { assertCapability } from './authz';
import {
  isOwnedAgentBridgeKey,
  newId,
  ownedStorageKey,
  sha256,
  type AgentBridgeStore,
  type StoredDocument,
  type StoredOperation,
  type StoredProposal,
} from './store';

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;
const APPROVAL_TTL_MS = 30 * 60 * 1000;

export type PostingPort = {
  commitPurchaseBill(input: {
    actor: Actor;
    facts: ProposalFacts;
    preview: PreviewEffect;
    idempotencyKey: string;
  }): Promise<{ billId: string; documentNumber: string }>;
  lookupByIdempotencyKey?(
    tenantId: string,
    key: string,
  ): Promise<{ billId: string; documentNumber: string } | null>;
};

export type AgentBridgeDeps = {
  store: AgentBridgeStore;
  extractor?: ExtractionProvider;
  posting?: PostingPort;
  policyFor(tenantId: string): Promise<CompanyPolicy>;
  now?: () => number;
  authorizeActor?(actor: Actor): Promise<Actor>;
};

export class AgentBridgeService {
  constructor(private readonly deps: AgentBridgeDeps) {}

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  private async flags(tenantId: string): Promise<FeatureFlags> {
    return this.deps.store.flags(tenantId);
  }

  private async authorized(actor: Actor, need: Capability): Promise<Actor> {
    const next = this.deps.authorizeActor ? await this.deps.authorizeActor(actor) : actor;
    assertCapability(next, need);
    return next;
  }

  async getCapabilities(actor: Actor) {
    actor = await this.authorized(actor, 'read');
    const flags = await this.flags(actor.tenantId);
    return {
      schemaVersion: SCHEMA_VERSION,
      policyVersion: (await this.deps.policyFor(actor.tenantId)).policyVersion,
      flags,
      capabilities: actor.capabilities,
      tools: TOOL_NAMES,
      posting: flags.enabled && !flags.postingDisabled && !flags.draftOnly && actor.capabilities.includes('post'),
    };
  }

  async getPolicyContext(actor: Actor) {
    actor = await this.authorized(actor, 'read');
    return this.deps.policyFor(actor.tenantId);
  }

  async submitDocument(
    actor: Actor,
    input: { filename: string; mime: string; bytes: Uint8Array; textHint?: string },
  ) {
    actor = await this.authorized(actor, 'upload');
    const flags = await this.flags(actor.tenantId);
    if (!flags.enabled) return fail('FEATURE_DISABLED', 'AgentBridge is off for this company.');
    if (!ALLOWED_MIME.has(input.mime)) return fail('ATTACHMENT_REJECTED', `Unsupported type ${input.mime}.`);
    if (input.bytes.byteLength > MAX_BYTES) return fail('ATTACHMENT_REJECTED', 'File exceeds 8 MB.');
    if (input.filename.includes('..') || input.filename.includes('/') || input.filename.includes('\\')) {
      return fail('ATTACHMENT_REJECTED', 'Unsafe filename.');
    }
    const hash = sha256(input.bytes);
    const existing = await this.deps.store.findByHash(actor.tenantId, hash);
    const id = newId();
    const key = ownedStorageKey(actor.tenantId, input.filename, id);
    await this.deps.store.putBlob({
      key,
      tenantId: actor.tenantId,
      bytes: input.bytes,
      mime: input.mime,
      filename: input.filename,
    });
    const doc: StoredDocument = {
      id,
      tenantId: actor.tenantId,
      userId: actor.userId,
      status: 'received',
      contentHash: hash,
      storageKey: key,
      filename: input.filename,
      mime: input.mime,
      bytes: input.bytes.byteLength,
      proposalRevision: 0,
      createdAt: new Date(this.now()).toISOString(),
      updatedAt: new Date(this.now()).toISOString(),
    };
    await this.deps.store.saveDocument(doc);
    await this.runExtraction(doc, input.textHint, Boolean(existing), input.bytes);
    const fresh = await this.deps.store.getDocument(actor.tenantId, id);
    return { ok: true as const, document: fresh, duplicateOf: existing && existing.id !== id ? existing.id : undefined };
  }

  async processDocument(actor: Actor, documentId: string) {
    actor = await this.authorized(actor, 'draft');
    const doc = await this.requireDoc(actor.tenantId, documentId);
    const blob = await this.deps.store.getBlob(actor.tenantId, doc.storageKey);
    await this.runExtraction(doc, undefined, false, blob?.bytes);
    return this.deps.store.getDocument(actor.tenantId, documentId);
  }

  private async runExtraction(doc: StoredDocument, textHint?: string, duplicateScan = false, bytes?: Uint8Array) {
    assertTransition(doc.status, 'extracting');
    doc.status = 'extracting';
    await this.deps.store.saveDocument(doc);
    const extractor = this.deps.extractor ?? fixtureExtractor;
    try {
      const result = await extractor.extract({ contentHash: doc.contentHash, bytes, mime: doc.mime, textHint });
      doc.extractorId = result.extractorId;
      doc.extractorLive = result.live;
      doc.facts = result.facts;
      const policy = await this.deps.policyFor(doc.tenantId);
      const issues = issuesFromExtraction(result.facts, policy, duplicateScan);
      const proposal = await this.writeProposal(doc, factsFromExtracted(result.facts, policy), issues);
      doc.proposalId = proposal.id;
      doc.status = blockingIssues(issues).length ? 'needs_clarification' : 'draft';
      doc.updatedAt = new Date(this.now()).toISOString();
      await this.deps.store.saveDocument(doc);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      doc.status = 'failed';
      doc.updatedAt = new Date(this.now()).toISOString();
      await this.deps.store.saveDocument(doc);
      if ((e as { code?: string }).code === 'PROVIDER_UNCONFIGURED') {
        return fail('PROVIDER_UNCONFIGURED', msg);
      }
      return fail('EXTRACTION_FAILED', msg);
    }
  }

  async getProcessingStatus(actor: Actor, documentId: string) {
    actor = await this.authorized(actor, 'read');
    const doc = await this.requireDoc(actor.tenantId, documentId);
    const proposal = doc.proposalId ? await this.deps.store.getProposal(actor.tenantId, doc.proposalId) : null;
    return { document: doc, proposal, allowedNext: nextActions(doc.status, actor) };
  }

  async listInbox(actor: Actor) {
    actor = await this.authorized(actor, 'read');
    return this.deps.store.listDocuments(actor.tenantId);
  }

  async proposePurchaseBill(actor: Actor, documentId: string) {
    actor = await this.authorized(actor, 'draft');
    const doc = await this.requireDoc(actor.tenantId, documentId);
    if (!doc.proposalId) return fail('EXTRACTION_FAILED', 'No proposal yet.');
    return this.deps.store.getProposal(actor.tenantId, doc.proposalId);
  }

  async updateDraft(actor: Actor, input: { proposalId: string; expectedRevision: number; patch: Partial<ProposalFacts> }) {
    actor = await this.authorized(actor, 'draft');
    const proposal = await this.requireProposal(actor.tenantId, input.proposalId);
    if (proposal.revision !== input.expectedRevision) return fail('STALE_REVISION', 'Draft changed. Reload and try again.');
    const facts = { ...proposal.facts, ...input.patch };
    const policy = await this.deps.policyFor(actor.tenantId);
    const issues = issuesFromProposal(facts, policy);
    proposal.facts = facts;
    proposal.issues = issues;
    proposal.preview = undefined;
    proposal.revision += 1;
    proposal.hash = '';
    await this.deps.store.saveProposal(proposal);
    await this.deps.store.revokeApprovalsForProposal(actor.tenantId, proposal.id, new Date(this.now()).toISOString());
    const doc = await this.requireDoc(actor.tenantId, proposal.documentId);
    assertTransition(doc.status, blockingIssues(issues).length ? 'needs_clarification' : 'draft');
    doc.status = blockingIssues(issues).length ? 'needs_clarification' : 'draft';
    doc.proposalRevision = proposal.revision;
    await this.deps.store.saveDocument(doc);
    return proposal;
  }

  async answerIssue(actor: Actor, input: { proposalId: string; issueId: string; value: string }) {
    actor = await this.authorized(actor, 'draft');
    const proposal = await this.requireProposal(actor.tenantId, input.proposalId);
    const issue = proposal.issues.find((i) => i.id === input.issueId);
    if (!issue) return fail('STALE_REVISION', 'That question is no longer open.');
    if (issue.allowedResolutions.includes('stop_unsupported') && input.value === 'stop_unsupported') {
      const doc = await this.requireDoc(actor.tenantId, proposal.documentId);
      doc.status = 'rejected';
      await this.deps.store.saveDocument(doc);
      return { proposal, rejected: true };
    }
    proposal.answered[input.issueId] = input.value;
    const policy = await this.deps.policyFor(actor.tenantId);
    applyAnswer(proposal.facts, issue.code, input.value, policy);
    return this.updateDraft(actor, {
      proposalId: proposal.id,
      expectedRevision: proposal.revision,
      patch: proposal.facts,
    });
  }

  async validateProposal(actor: Actor, proposalId: string) {
    actor = await this.authorized(actor, 'draft');
    const proposal = await this.requireProposal(actor.tenantId, proposalId);
    const policy = await this.deps.policyFor(actor.tenantId);
    proposal.issues = issuesFromProposal(proposal.facts, policy);
    const blocked = blockingIssues(proposal.issues);
    const doc = await this.requireDoc(actor.tenantId, proposal.documentId);
    if (blocked.length) {
      doc.status = 'needs_clarification';
      await this.deps.store.saveDocument(doc);
      await this.deps.store.saveProposal(proposal);
      return { ok: false as const, proposal, issues: blocked };
    }
    doc.status = 'validated';
    await this.deps.store.saveDocument(doc);
    await this.deps.store.saveProposal(proposal);
    return { ok: true as const, proposal, issues: [] as typeof proposal.issues };
  }

  async getPreview(actor: Actor, proposalId: string) {
    actor = await this.authorized(actor, 'read');
    const proposal = await this.requireProposal(actor.tenantId, proposalId);
    const policy = await this.deps.policyFor(actor.tenantId);
    const blocked = blockingIssues(issuesFromProposal(proposal.facts, policy));
    if (blocked.length) return fail('STALE_REVISION', blocked[0]!.message);
    proposal.preview = calculatePreview(proposal.facts, policy);
    proposal.hash = proposalHash(proposal.facts, proposal.preview.previewVersion, policy.policyVersion);
    await this.deps.store.saveProposal(proposal);
    return proposal.preview;
  }

  async requestApproval(actor: Actor, proposalId: string) {
    actor = await this.authorized(actor, 'draft');
    const preview = await this.getPreview(actor, proposalId);
    if ('ok' in preview && preview.ok === false) return preview;
    const doc = await this.requireDoc(actor.tenantId, (await this.requireProposal(actor.tenantId, proposalId)).documentId);
    doc.status = 'awaiting_approval';
    await this.deps.store.saveDocument(doc);
    return { ok: true as const, proposalId, preview };
  }

  async grantApproval(actor: Actor, proposalId: string) {
    actor = await this.authorized(actor, 'approve');
    if (actor.connectionId) {
      return fail('HUMAN_APPROVAL_REQUIRED', 'A connected agent cannot mint human approval.');
    }
    const flags = await this.flags(actor.tenantId);
    if (!flags.enabled) return fail('FEATURE_DISABLED', 'AgentBridge is off for this company.');
    const proposal = await this.requireProposal(actor.tenantId, proposalId);
    const doc = await this.requireDoc(actor.tenantId, proposal.documentId);
    if (!['validated', 'awaiting_approval', 'draft'].includes(doc.status)) {
      return fail('STALE_REVISION', `Cannot approve from status ${doc.status}.`);
    }
    const policy = await this.deps.policyFor(actor.tenantId);
    const blocked = this.closedForCommit(proposal.facts, policy);
    if (blocked) return blocked;
    const preview = calculatePreview(proposal.facts, policy);
    const hash = proposalHash(proposal.facts, preview.previewVersion, policy.policyVersion);
    proposal.preview = preview;
    proposal.hash = hash;
    await this.deps.store.saveProposal(proposal);
    const approval = {
      id: newId(),
      proposalId,
      proposalHash: hash,
      previewVersion: preview.previewVersion,
      policyVersion: policy.policyVersion,
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      grantedAt: new Date(this.now()).toISOString(),
      expiresAt: new Date(this.now() + APPROVAL_TTL_MS).toISOString(),
    };
    await this.deps.store.saveApproval(approval);
    assertTransition(doc.status, 'awaiting_approval');
    doc.status = 'awaiting_approval';
    await this.deps.store.saveDocument(doc);
    return approval;
  }

  async commitApprovedProposal(
    actor: Actor,
    input: { proposalId: string; approvalId: string; idempotencyKey: string },
  ) {
    actor = await this.authorized(actor, 'post');
    const flags = await this.flags(actor.tenantId);
    if (!flags.enabled) return fail('FEATURE_DISABLED', 'AgentBridge is off for this company.');
    if (flags.postingDisabled) return fail('POSTING_DISABLED', 'Agent posting is stopped for this company.');
    if (flags.draftOnly) return fail('DRAFT_ONLY', 'This company is in draft-only mode.');
    if (!input.idempotencyKey) return fail('IDEMPOTENCY_MISMATCH', 'Idempotency key is required.');

    const proposal = await this.requireProposal(actor.tenantId, input.proposalId);
    const approval = await this.deps.store.getApproval(actor.tenantId, input.approvalId);
    if (!approval || approval.proposalId !== proposal.id) return fail('EXPIRED_APPROVAL', 'Approval was not found.');
    if (approval.revokedAt) return fail('EXPIRED_APPROVAL', 'Approval was revoked.');
    if (Date.parse(approval.expiresAt) <= this.now()) return fail('EXPIRED_APPROVAL', 'Approval expired. Preview again.');
    const policy = await this.deps.policyFor(actor.tenantId);
    const blocked = this.closedForCommit(proposal.facts, policy);
    if (blocked) return blocked;
    const preview = calculatePreview(proposal.facts, policy);
    const hash = proposalHash(proposal.facts, preview.previewVersion, policy.policyVersion);
    if (hash !== approval.proposalHash || policy.policyVersion !== approval.policyVersion) {
      return fail('STALE_REVISION', 'The proposal or policy changed after approval.');
    }

    const payloadHash = sha256(JSON.stringify({ proposalId: proposal.id, hash, approvalId: approval.id }));
    const opId = newId();
    const receipt: OperationReceipt = {
      operationId: opId,
      idempotencyKey: input.idempotencyKey,
      status: 'posting',
    };
    const claimed = await this.deps.store.claimCommit({
      id: opId,
      tenantId: actor.tenantId,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      proposalId: proposal.id,
      approvalId: approval.id,
      receipt,
    });
    if (!claimed.claimed) {
      if (claimed.existing.payloadHash !== payloadHash && claimed.existing.idempotencyKey === input.idempotencyKey) {
        return fail('IDEMPOTENCY_MISMATCH', 'This key was used with a different payload.');
      }
      return this.reconcileExisting(actor, claimed.existing);
    }

    const doc = await this.requireDoc(actor.tenantId, proposal.documentId);
    assertTransition(doc.status, 'posting');
    doc.status = 'posting';
    await this.deps.store.saveDocument(doc);

    try {
      if (!this.deps.posting) throw new Error('Posting adapter is not configured.');
      const posted = await this.deps.posting.commitPurchaseBill({
        actor,
        facts: proposal.facts,
        preview,
        idempotencyKey: input.idempotencyKey,
      });
      receipt.status = 'posted';
      receipt.billId = posted.billId;
      receipt.documentNumber = posted.documentNumber;
      receipt.postedAt = new Date(this.now()).toISOString();
      receipt.journalMemo = preview.plainLanguage;
      doc.status = 'posted';
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (isUncertainCommit(e)) {
        receipt.status = 'unknown_outcome';
        receipt.error = message;
        doc.status = 'unknown_outcome';
      } else {
        receipt.status = 'failed';
        receipt.error = message;
        doc.status = 'failed';
      }
    }
    await this.deps.store.saveOperation({
      id: opId,
      tenantId: actor.tenantId,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      proposalId: proposal.id,
      approvalId: approval.id,
      receipt,
    });
    await this.deps.store.saveDocument(doc);
    return receipt;
  }

  async getOperationStatus(actor: Actor, operationId: string) {
    actor = await this.authorized(actor, 'read');
    const op = await this.deps.store.getOperation(actor.tenantId, operationId);
    if (!op) return fail('STALE_REVISION', 'Operation was not found.');
    return this.reconcileExisting(actor, op);
  }

  async getReceipt(actor: Actor, operationId: string) {
    return this.getOperationStatus(actor, operationId);
  }

  async getApprovalForProposal(actor: Actor, proposalId: string) {
    actor = await this.authorized(actor, 'read');
    return this.deps.store.findApprovalForProposal(actor.tenantId, proposalId);
  }

  async getOwnedAttachment(actor: Actor, key: string) {
    actor = await this.authorized(actor, 'read');
    if (!isOwnedAgentBridgeKey(actor.tenantId, key)) return fail('ATTACHMENT_REJECTED', 'Foreign attachment handle.');
    return this.deps.store.getBlob(actor.tenantId, key);
  }

  private closedForCommit(facts: ProposalFacts, policy: CompanyPolicy) {
    if (!Number.isFinite(policy.vatRatePercent) || policy.vatRatePercent < 0) {
      return fail('MISSING_TAX_POLICY', 'Company tax policy is not configured.');
    }
    if (!policy.currency) return fail('AMBIGUOUS_CURRENCY', 'Company currency is not configured.');
    if (!policy.approvedCategories.length) {
      return fail('AMBIGUOUS_CATEGORY', 'No approved expense category is configured.');
    }
    const issues = issuesFromProposal(facts, policy);
    const blocked = blockingIssues(issues);
    if (blocked.length) return fail(blocked[0]!.code, blocked[0]!.message);
    if (facts.paidStatus !== 'unpaid') {
      return fail('UNSUPPORTED_PAID', 'Evidence of payment does not authorize a payment or a paid bill in this workflow.');
    }
    if (facts.documentKind !== 'service_expense') {
      return fail('UNSUPPORTED_STOCK', 'Stock or mixed stock/service invoices are out of this first workflow.');
    }
    if (facts.currency !== policy.currency) {
      return fail('CURRENCY_MISMATCH', `This company books ${policy.currency}.`);
    }
    return null;
  }

  private async reconcileExisting(actor: Actor, op: StoredOperation) {
    if (op.receipt.status === 'posted') {
      await this.syncPostedDocument(op);
      return op.receipt;
    }
    if ((op.receipt.status === 'posting' || op.receipt.status === 'unknown_outcome') && this.deps.posting?.lookupByIdempotencyKey) {
      const found = await this.deps.posting.lookupByIdempotencyKey(actor.tenantId, op.idempotencyKey);
      if (found) {
        op.receipt.status = 'posted';
        op.receipt.billId = found.billId;
        op.receipt.documentNumber = found.documentNumber;
        op.receipt.postedAt = op.receipt.postedAt ?? new Date(this.now()).toISOString();
        op.receipt.error = undefined;
        await this.deps.store.saveOperation(op);
        await this.syncPostedDocument(op);
        return op.receipt;
      }
    }
    return op.receipt;
  }

  private async syncPostedDocument(op: StoredOperation) {
    const proposal = await this.deps.store.getProposal(op.tenantId, op.proposalId);
    if (!proposal) return;
    const doc = await this.deps.store.getDocument(op.tenantId, proposal.documentId);
    if (!doc) return;
    if (doc.status === 'posted') return;
    if (doc.status === 'posting' || doc.status === 'unknown_outcome') {
      assertTransition(doc.status, 'posted');
    }
    doc.status = 'posted';
    doc.updatedAt = new Date(this.now()).toISOString();
    await this.deps.store.saveDocument(doc);
  }

  private async requireDoc(tenantId: string, id: string) {
    const doc = await this.deps.store.getDocument(tenantId, id);
    if (!doc) throw Object.assign(new Error('Document was not found in this company.'), { code: 'PERMISSION_DENIED' });
    return doc;
  }

  private async requireProposal(tenantId: string, id: string) {
    const p = await this.deps.store.getProposal(tenantId, id);
    if (!p) throw Object.assign(new Error('Proposal was not found in this company.'), { code: 'PERMISSION_DENIED' });
    return p;
  }

  private async writeProposal(doc: StoredDocument, facts: ProposalFacts, issues: ReturnType<typeof issuesFromProposal>) {
    const proposal: StoredProposal = {
      id: newId(),
      tenantId: doc.tenantId,
      documentId: doc.id,
      revision: 1,
      hash: '',
      facts,
      issues,
      answered: {},
    };
    await this.deps.store.saveProposal(proposal);
    return proposal;
  }
}

export const TOOL_NAMES = [
  'get_capabilities',
  'get_policy_context',
  'submit_document',
  'get_processing_status',
  'propose_purchase_bill',
  'update_draft',
  'validate_proposal',
  'answer_issue',
  'get_preview',
  'request_approval',
  'grant_approval',
  'commit_approved_proposal',
  'get_operation_status',
  'get_receipt',
] as const;

function fail(code: string, error: string) {
  return { ok: false as const, code, error };
}

function isUncertainCommit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|ECONNRESET|EPIPE|uncertain|network|fetch failed/i.test(message);
}

function factsFromExtracted(
  extracted: NonNullable<StoredDocument['facts']>,
  policy: CompanyPolicy,
): ProposalFacts {
  const category = policy.approvedCategories[0];
  const net = extracted.net?.value ?? money(0);
  const tax = extracted.tax?.value ?? money(0);
  const gross = extracted.gross?.value ?? money(net.minor + tax.minor);
  return {
    supplierName: extracted.supplierName?.value ?? '',
    supplierInvoiceNumber: extracted.supplierInvoiceNumber?.value ?? '',
    issueDate: extracted.issueDate?.value ?? '',
    currency: extracted.currency?.value ?? policy.currency,
    paidStatus: extracted.paidStatus?.value ?? 'unknown',
    documentKind: extracted.documentKind?.value ?? 'unknown',
    expenseAccountCode: category?.accountCode ?? '',
    categoryLabel: category?.label ?? '',
    invoiceKind: policy.vatRegistered && tax.minor > 0 ? 'tax_invoice' : 'commercial',
    net,
    tax,
    gross,
    lineDescription: extracted.lineDescription?.value ?? 'Supplier service',
  };
}

function applyAnswer(facts: ProposalFacts, code: string, value: string, policy: CompanyPolicy) {
  if (code === 'MISSING_SUPPLIER' || code === 'UNKNOWN_SUPPLIER') facts.supplierName = value;
  if (code === 'MISSING_INVOICE_NUMBER') facts.supplierInvoiceNumber = value;
  if (code === 'MISSING_DATE' || code === 'AMBIGUOUS_DATE') facts.issueDate = value;
  if (code === 'AMBIGUOUS_CURRENCY' && value === 'confirm_local') facts.currency = policy.currency;
  if (code === 'CURRENCY_MISMATCH' && value === 'confirm_local') facts.currency = policy.currency;
  if (code === 'UNSUPPORTED_PAID' && value === 'confirm_unpaid') facts.paidStatus = 'unpaid';
  if ((code === 'UNSUPPORTED_STOCK' || code === 'UNSUPPORTED_MIXED') && value === 'confirm_service') {
    facts.documentKind = 'service_expense';
  }
  if (code === 'AMBIGUOUS_CATEGORY' || code === 'MISSING_CATEGORY') {
    const hit = policy.approvedCategories.find((c) => c.label === value || c.accountCode === value);
    if (hit) {
      facts.categoryLabel = hit.label;
      facts.expenseAccountCode = hit.accountCode;
    }
  }
  if (code === 'CONFLICTING_TOTALS' && value === 'use_net_plus_tax') {
    facts.gross = money(facts.net.minor + facts.tax.minor, facts.currency);
  }
  if (code === 'MISSING_TAX_POLICY' && value === 'treat_commercial') {
    facts.invoiceKind = 'commercial';
    facts.tax = money(0, facts.currency);
    facts.gross = facts.net;
  }
}

function nextActions(status: StoredDocument['status'], actor: Actor): string[] {
  const out: string[] = ['get_processing_status'];
  if (status === 'needs_clarification' && actor.capabilities.includes('draft')) out.push('answer_issue', 'update_draft');
  if (status === 'draft' || status === 'validated') {
    if (actor.capabilities.includes('draft')) out.push('validate_proposal', 'get_preview', 'request_approval');
  }
  if (status === 'awaiting_approval' && actor.capabilities.includes('approve')) out.push('grant_approval');
  if (status === 'awaiting_approval' && actor.capabilities.includes('post')) out.push('commit_approved_proposal');
  if (status === 'posted') out.push('get_receipt');
  return out;
}

export function recordingPostingPort(): PostingPort & { posts: { billId: string; facts: ProposalFacts }[] } {
  const posts: { billId: string; facts: ProposalFacts }[] = [];
  const byKey = new Map<string, { billId: string; documentNumber: string }>();
  return {
    posts,
    async commitPurchaseBill(input) {
      const existing = byKey.get(input.idempotencyKey);
      if (existing) return existing;
      const billId = newId();
      const result = { billId, documentNumber: `APB-${posts.length + 1}` };
      posts.push({ billId, facts: input.facts });
      byKey.set(input.idempotencyKey, result);
      return result;
    },
    async lookupByIdempotencyKey(_tenantId, key) {
      return byKey.get(key) ?? null;
    },
  };
}
