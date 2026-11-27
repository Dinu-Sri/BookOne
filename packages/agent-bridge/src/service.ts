import type {
  Actor,
  Capability,
  CompanyPolicy,
  ExtractedFacts,
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
import {
  AGENT_FACTS_EXTRACTOR_ID,
  extractorFor,
  FIXTURE_EXTRACTOR_ID,
  LIVE_EXTRACTOR_ID,
  MANUAL_FACTS_EXTRACTOR_ID,
  type ExtractionProvider,
} from './extraction';
import { assertCapability } from './authz';
import { capabilityMatrix } from './operations';
import { UPLOAD_SESSION_TTL_MS } from './oauth';
import {
  isOwnedAgentBridgeKey,
  newId,
  ownedStorageKey,
  sha256,
  type AgentBridgeStore,
  type StoredBatch,
  type StoredDocument,
  type StoredOperation,
  type StoredProposal,
  type StoredUploadSession,
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

/** Print designs as seen by an assistant. Implemented by the web runtime; never deletes or approves. */
export type PrintDesignPort = {
  listItems(tenantId: string): Promise<unknown>;
  guide(tenantId: string, kind: string): Promise<unknown>;
  listDesigns(tenantId: string, kind?: string): Promise<unknown>;
  getDesign(tenantId: string, designId: string): Promise<unknown>;
  assets(tenantId: string): Promise<unknown>;
  create(input: {
    tenantId: string;
    userId: string;
    connectionId: string | null;
    agentLabel: string;
    kind: string;
    name: string;
    designJson: string;
    changeNote?: string;
  }): Promise<unknown>;
  saveVersion(input: {
    tenantId: string;
    userId: string;
    connectionId: string | null;
    agentLabel: string;
    basedOnDesignId: string;
    designJson: string;
    changeNote?: string;
    name?: string;
  }): Promise<unknown>;
  requestApproval(input: { tenantId: string; userId: string; designId: string; message?: string }): Promise<unknown>;
};

export type CommerceMappingPort = {
  listConnections(tenantId: string): Promise<
    Array<{ id: string; name: string; kind: string; locationId: string | null; mappingCount: number }>
  >;
  listCatalog(
    tenantId: string,
    q?: string,
  ): Promise<Array<{ id: string; sku: string; name: string; unit: string; archived: boolean; sellPrice: string }>>;
  mappingSummary(
    tenantId: string,
    connectionId: string,
  ): Promise<{
    connectionId: string;
    connectionName: string;
    locationId: string | null;
    mapped: number;
    items: Array<{
      sku: string;
      bookoneProductId: string;
      bookoneName: string | null;
      externalProductId: string;
      externalVariantId: string;
      status: string;
    }>;
  }>;
  previewProposal(input: {
    tenantId: string;
    userId: string;
    connectionId: string;
    observations: Array<{
      sku?: string;
      name?: string;
      externalProductId: string;
      externalVariantId?: string;
      origin: 'agent' | 'verified_store';
    }>;
  }): Promise<{
    proposalId: string;
    items: Array<{ sku: string; kind: string; reason: string; bookoneProductId: string | null; origin: string }>;
  }>;
};

export type AgentBridgeDeps = {
  store: AgentBridgeStore;
  extractor?: ExtractionProvider;
  posting?: PostingPort;
  commerce?: CommerceMappingPort;
  printDesigns?: PrintDesignPort;
  policyFor(tenantId: string): Promise<CompanyPolicy>;
  now?: () => number;
  authorizeActor?(actor: Actor): Promise<Actor>;
  publicBaseUrl?: string;
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

  private extractor(): ExtractionProvider {
    return this.deps.extractor ?? extractorFor();
  }

  private publicBase(): string {
    return (this.deps.publicBaseUrl || process.env.AGENT_BRIDGE_PUBLIC_URL || process.env.AUTH_URL || '').replace(/\/$/, '');
  }

  async getCapabilities(actor: Actor) {
    actor = await this.authorized(actor, 'read');
    const flags = await this.flags(actor.tenantId);
    return {
      schemaVersion: SCHEMA_VERSION,
      policyVersion: (await this.deps.policyFor(actor.tenantId)).policyVersion,
      flags,
      capabilities: actor.capabilities,
      tools: toolsForActor(actor),
      operations: capabilityMatrix(),
      posting: flags.enabled && !flags.postingDisabled && !flags.draftOnly && actor.capabilities.includes('post'),
      defaultConnectionScopes: ['read', 'upload', 'draft'],
      fileTransfer: {
        bytes: 'contentBase64 on submit_document or finalize_upload_session',
        fallback: 'create_upload_session returns an authenticated BookOne review URL. Chat attachments are not forwarded automatically.',
      },
    };
  }

  async getPolicyContext(actor: Actor) {
    actor = await this.authorized(actor, 'read');
    return this.deps.policyFor(actor.tenantId);
  }

  /** Optional abilities stop with the company switch ("Allow AI assistants"). */
  private async assistantsOn(tenantId: string) {
    const flags = await this.flags(tenantId);
    return flags.enabled;
  }

  private async designReady(actor: Actor, need: 'design_read' | 'design_write') {
    const next = await this.authorized(actor, need);
    if (!(await this.assistantsOn(next.tenantId))) {
      return { actor: next, port: null, refusal: fail('FEATURE_DISABLED', 'AI assistants are off for this company.') };
    }
    const port = this.deps.printDesigns;
    if (!port) return { actor: next, port: null, refusal: fail('FEATURE_DISABLED', 'Print designs are not wired on this runtime.') };
    return { actor: next, port, refusal: null };
  }

  private agentLabel(actor: Actor) {
    const id = actor.clientId ?? '';
    if (id === 'bookone-claude') return 'Claude';
    if (id === 'bookone-codex') return 'Codex';
    return id || 'Assistant';
  }

  async listPrintItems(actor: Actor) {
    const r = await this.designReady(actor, 'design_read');
    if (!r.port) return r.refusal;
    return r.port.listItems(r.actor.tenantId);
  }

  async getPrintDesignGuide(actor: Actor, kind: string) {
    const r = await this.designReady(actor, 'design_read');
    if (!r.port) return r.refusal;
    return r.port.guide(r.actor.tenantId, kind);
  }

  async listPrintDesigns(actor: Actor, kind?: string) {
    const r = await this.designReady(actor, 'design_read');
    if (!r.port) return r.refusal;
    return r.port.listDesigns(r.actor.tenantId, kind);
  }

  async getPrintDesign(actor: Actor, designId: string) {
    const r = await this.designReady(actor, 'design_read');
    if (!r.port) return r.refusal;
    return r.port.getDesign(r.actor.tenantId, designId);
  }

  async checkPrintAssets(actor: Actor) {
    const r = await this.designReady(actor, 'design_read');
    if (!r.port) return r.refusal;
    return r.port.assets(r.actor.tenantId);
  }

  async createPrintDesign(actor: Actor, input: { kind: string; name: string; designJson: string; changeNote?: string }) {
    const r = await this.designReady(actor, 'design_write');
    if (!r.port) return r.refusal;
    return r.port.create({
      tenantId: r.actor.tenantId,
      userId: r.actor.userId,
      connectionId: r.actor.connectionId ?? null,
      agentLabel: this.agentLabel(r.actor),
      kind: input.kind,
      name: input.name,
      designJson: input.designJson,
      changeNote: input.changeNote,
    });
  }

  async savePrintDesignVersion(
    actor: Actor,
    input: { basedOnDesignId: string; designJson: string; changeNote?: string; name?: string },
  ) {
    const r = await this.designReady(actor, 'design_write');
    if (!r.port) return r.refusal;
    return r.port.saveVersion({
      tenantId: r.actor.tenantId,
      userId: r.actor.userId,
      connectionId: r.actor.connectionId ?? null,
      agentLabel: this.agentLabel(r.actor),
      basedOnDesignId: input.basedOnDesignId,
      designJson: input.designJson,
      changeNote: input.changeNote,
      name: input.name,
    });
  }

  async requestPrintDesignApproval(actor: Actor, input: { designId: string; message?: string }) {
    const r = await this.designReady(actor, 'design_write');
    if (!r.port) return r.refusal;
    return r.port.requestApproval({
      tenantId: r.actor.tenantId,
      userId: r.actor.userId,
      designId: input.designId,
      message: input.message,
    });
  }

  async listCommerceConnections(actor: Actor) {
    actor = await this.authorized(actor, 'commerce_read');
    if (!(await this.assistantsOn(actor.tenantId))) return fail('FEATURE_DISABLED', 'AI assistants are off for this company.');
    if (!this.deps.commerce) return fail('FEATURE_DISABLED', 'Commerce mapping is not wired on this runtime.');
    const items = await this.deps.commerce.listConnections(actor.tenantId);
    return { ok: true as const, items, keysExposed: false };
  }

  async listBookoneCatalog(actor: Actor, q?: string) {
    actor = await this.authorized(actor, 'commerce_read');
    if (!(await this.assistantsOn(actor.tenantId))) return fail('FEATURE_DISABLED', 'AI assistants are off for this company.');
    if (!this.deps.commerce) return fail('FEATURE_DISABLED', 'Commerce mapping is not wired on this runtime.');
    const items = await this.deps.commerce.listCatalog(actor.tenantId, q);
    return { ok: true as const, items };
  }

  async getMappingSummary(actor: Actor, connectionId: string) {
    actor = await this.authorized(actor, 'commerce_read');
    if (!(await this.assistantsOn(actor.tenantId))) return fail('FEATURE_DISABLED', 'AI assistants are off for this company.');
    if (!this.deps.commerce) return fail('FEATURE_DISABLED', 'Commerce mapping is not wired on this runtime.');
    const summary = await this.deps.commerce.mappingSummary(actor.tenantId, connectionId);
    return { ok: true as const, ...summary, keysExposed: false };
  }

  async previewMappingProposal(
    actor: Actor,
    input: {
      connectionId: string;
      observations: Array<{
        sku?: string;
        name?: string;
        externalProductId: string;
        externalVariantId?: string;
        origin?: 'agent' | 'verified_store';
      }>;
    },
  ) {
    actor = await this.authorized(actor, 'commerce_propose');
    if (!(await this.assistantsOn(actor.tenantId))) return fail('FEATURE_DISABLED', 'AI assistants are off for this company.');
    if (!this.deps.commerce) return fail('FEATURE_DISABLED', 'Commerce mapping is not wired on this runtime.');
    if (!input.connectionId) return fail('VALIDATION', 'connectionId is required.');
    const observations = (input.observations ?? []).map((row) => ({
      sku: row.sku,
      name: row.name,
      externalProductId: row.externalProductId,
      externalVariantId: row.externalVariantId,
      origin: row.origin === 'verified_store' ? ('verified_store' as const) : ('agent' as const),
    }));
    const result = await this.deps.commerce.previewProposal({
      tenantId: actor.tenantId,
      userId: actor.userId,
      connectionId: input.connectionId,
      observations,
    });
    return {
      ok: true as const,
      proposalId: result.proposalId,
      items: result.items,
      applyInBookOne: true,
      humanApprovalRequired: true,
    };
  }

  async submitDocument(
    actor: Actor,
    input: {
      filename: string;
      mime: string;
      bytes: Uint8Array;
      textHint?: string;
      idempotencyKey?: string;
      /** Keep a second document for bytes already received (QA-1126-07). */
      allowDuplicate?: boolean;
    },
  ) {
    actor = await this.authorized(actor, 'upload');
    const flags = await this.flags(actor.tenantId);
    if (!flags.enabled) return fail('FEATURE_DISABLED', 'AgentBridge is off for this company.');
    if (!ALLOWED_MIME.has(input.mime)) return fail('ATTACHMENT_REJECTED', `Unsupported type ${input.mime}.`);
    if (input.bytes.byteLength < 1) return fail('ATTACHMENT_REJECTED', 'Empty file.');
    if (input.bytes.byteLength > MAX_BYTES) return fail('ATTACHMENT_REJECTED', 'File exceeds 8 MB.');
    if (input.filename.includes('..') || input.filename.includes('/') || input.filename.includes('\\')) {
      return fail('ATTACHMENT_REJECTED', 'Unsafe filename.');
    }
    if (!mimeSignatureOk(input.mime, input.bytes)) {
      return fail('ATTACHMENT_REJECTED', 'File bytes do not match the declared type.');
    }
    const hash = sha256(input.bytes);
    let id = newId();
    if (input.idempotencyKey && this.deps.store.claimFactsKey) {
      const claimed = await this.deps.store.claimFactsKey({
        tenantId: actor.tenantId,
        key: `upload:${input.idempotencyKey}`,
        payloadHash: hash,
        documentId: id,
      });
      if (!claimed.claimed) {
        if (claimed.existing.payloadHash !== hash) {
          return fail('IDEMPOTENCY_MISMATCH', 'This upload key was used with a different file.');
        }
        const existingDoc = await this.deps.store.getDocument(actor.tenantId, claimed.existing.documentId);
        if (existingDoc) return { ok: true as const, document: existingDoc };
        id = claimed.existing.documentId;
      }
    } else if (input.idempotencyKey && this.deps.store.getFactsKey) {
      const prior = await this.deps.store.getFactsKey(actor.tenantId, `upload:${input.idempotencyKey}`);
      if (prior) {
        if (prior.payloadHash !== hash) {
          return fail('IDEMPOTENCY_MISMATCH', 'This upload key was used with a different file.');
        }
        const existingDoc = await this.deps.store.getDocument(actor.tenantId, prior.documentId);
        return { ok: true as const, document: existingDoc };
      }
    }
    const existing = await this.deps.store.findByHash(actor.tenantId, hash);
    if (existing && existing.id !== id && existing.status !== 'rejected' && !input.allowDuplicate) {
      return {
        ok: false as const,
        code: 'DUPLICATE_DOCUMENT',
        error: duplicateDocumentMessage(existing),
        duplicateOf: existing.id,
      };
    }
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
      intakeMode: 'upload',
      createdAt: new Date(this.now()).toISOString(),
      updatedAt: new Date(this.now()).toISOString(),
    };
    await this.deps.store.saveDocument(doc);
    if (input.idempotencyKey && this.deps.store.saveFactsKey && !this.deps.store.claimFactsKey) {
      await this.deps.store.saveFactsKey({
        tenantId: actor.tenantId,
        key: `upload:${input.idempotencyKey}`,
        payloadHash: hash,
        documentId: id,
      });
    }
    if (this.shouldSkipServerOcr(this.extractor()) && !input.textHint) {
      assertTransition(doc.status, 'awaiting_facts');
      doc.status = 'awaiting_facts';
      doc.lastErrorCode = 'PROVIDER_UNCONFIGURED';
      doc.lastErrorMessage =
        'Server OCR is not configured. Enter the invoice facts here, or ask a connected agent to submit them against this document.';
      doc.updatedAt = new Date(this.now()).toISOString();
      await this.deps.store.saveDocument(doc);
      return { ok: true as const, document: doc, duplicateOf: existing && existing.id !== id ? existing.id : undefined };
    }
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

  private shouldSkipServerOcr(extractor: ExtractionProvider): boolean {
    if (extractor.id === FIXTURE_EXTRACTOR_ID) return false;
    if (extractor.id === LIVE_EXTRACTOR_ID) {
      return process.env.AGENT_BRIDGE_OCR_LIVE !== '1' && process.env.AGENT_BRIDGE_EXTRACTOR !== 'live';
    }
    return true;
  }

  private async runExtraction(doc: StoredDocument, textHint?: string, duplicateScan = false, bytes?: Uint8Array) {
    assertTransition(doc.status, 'extracting');
    doc.status = 'extracting';
    doc.lastErrorCode = undefined;
    doc.lastErrorMessage = undefined;
    await this.deps.store.saveDocument(doc);
    const extractor = this.extractor();
    try {
      const result = await extractor.extract({ contentHash: doc.contentHash, bytes, mime: doc.mime, textHint });
      doc.extractorId = result.extractorId;
      doc.extractorLive = result.live;
      doc.facts = result.facts;
      doc.intakeMode = result.live ? 'ocr' : doc.intakeMode ?? 'upload';
      const policy = await this.deps.policyFor(doc.tenantId);
      const issues = issuesFromExtraction(result.facts, policy, duplicateScan);
      const proposal = await this.writeProposal(doc, factsFromExtracted(result.facts, policy), issues);
      doc.proposalId = proposal.id;
      doc.proposalRevision = proposal.revision;
      doc.status = blockingIssues(issues).length ? 'needs_clarification' : 'draft';
      doc.updatedAt = new Date(this.now()).toISOString();
      await this.deps.store.saveDocument(doc);
    } catch (e) {
      const code = (e as { code?: string }).code;
      const msg = sanitizeExtractorMessage(e instanceof Error ? e.message : String(e));
      doc.lastErrorCode = code === 'PROVIDER_UNCONFIGURED' ? 'PROVIDER_UNCONFIGURED' : 'EXTRACTION_FAILED';
      doc.lastErrorMessage =
        code === 'PROVIDER_UNCONFIGURED'
          ? 'Server OCR is not configured. Enter the invoice facts against this stored document.'
          : msg;
      doc.status = code === 'PROVIDER_UNCONFIGURED' ? 'awaiting_facts' : 'failed';
      doc.updatedAt = new Date(this.now()).toISOString();
      await this.deps.store.saveDocument(doc);
      return fail(doc.lastErrorCode, doc.lastErrorMessage);
    }
  }

  async getProcessingStatus(actor: Actor, documentId: string) {
    actor = await this.authorized(actor, 'read');
    const doc = await this.requireDoc(actor.tenantId, documentId);
    const proposal = doc.proposalId ? await this.deps.store.getProposal(actor.tenantId, doc.proposalId) : null;
    return {
      document: doc,
      proposal,
      allowedNext: nextActions(doc.status, actor),
      lastErrorCode: doc.lastErrorCode,
      lastErrorMessage: doc.lastErrorMessage,
    };
  }

  async submitExtractedFacts(
    actor: Actor,
    input: {
      documentId: string;
      contentHash: string;
      expectedRevision: number;
      idempotencyKey?: string;
      supplierName?: string;
      supplierInvoiceNumber?: string;
      issueDate?: string;
      currency?: string;
      paidStatus?: ProposalFacts['paidStatus'];
      documentKind?: ProposalFacts['documentKind'];
      netMinor?: number;
      taxMinor?: number;
      grossMinor?: number;
      expenseAccountCode?: string;
      categoryLabel?: string;
      lineDescription?: string;
      invoiceKind?: ProposalFacts['invoiceKind'];
      origin?: 'agent-facts' | 'manual';
    },
  ) {
    actor = await this.authorized(actor, 'draft');
    const flags = await this.flags(actor.tenantId);
    if (!flags.enabled) return fail('FEATURE_DISABLED', 'AgentBridge is off for this company.');
    const payloadHash = sha256(
      JSON.stringify({
        documentId: input.documentId,
        contentHash: input.contentHash,
        expectedRevision: input.expectedRevision,
        supplierName: input.supplierName ?? '',
        supplierInvoiceNumber: input.supplierInvoiceNumber ?? '',
        issueDate: input.issueDate ?? '',
        currency: input.currency ?? '',
        paidStatus: input.paidStatus ?? '',
        documentKind: input.documentKind ?? '',
        netMinor: input.netMinor ?? 0,
        taxMinor: input.taxMinor ?? 0,
        grossMinor: input.grossMinor ?? 0,
        expenseAccountCode: input.expenseAccountCode ?? '',
        categoryLabel: input.categoryLabel ?? '',
        lineDescription: input.lineDescription ?? '',
        invoiceKind: input.invoiceKind ?? '',
      }),
    );
    if (input.idempotencyKey && this.deps.store.claimFactsKey) {
      const claimed = await this.deps.store.claimFactsKey({
        tenantId: actor.tenantId,
        key: `facts:${input.idempotencyKey}`,
        payloadHash,
        documentId: input.documentId,
      });
      if (!claimed.claimed) {
        if (claimed.existing.payloadHash !== payloadHash) {
          return fail('IDEMPOTENCY_MISMATCH', 'This facts key was used with a different payload.');
        }
        const status = await this.getProcessingStatus(actor, claimed.existing.documentId);
        return { ok: true as const, document: status.document, proposal: status.proposal };
      }
    } else if (input.idempotencyKey && this.deps.store.getFactsKey) {
      const prior = await this.deps.store.getFactsKey(actor.tenantId, `facts:${input.idempotencyKey}`);
      if (prior) {
        if (prior.payloadHash !== payloadHash) {
          return fail('IDEMPOTENCY_MISMATCH', 'This facts key was used with a different payload.');
        }
        const status = await this.getProcessingStatus(actor, prior.documentId);
        return { ok: true as const, document: status.document, proposal: status.proposal };
      }
    }
    const doc = await this.requireDoc(actor.tenantId, input.documentId);
    if (doc.userId !== actor.userId && !actor.capabilities.includes('approve')) {
      return fail('PERMISSION_DENIED', 'This document belongs to another user in the company.');
    }
    if (doc.contentHash !== input.contentHash) {
      return fail('FACTS_HASH_MISMATCH', 'The content hash does not match the stored original.');
    }
    if (doc.proposalRevision !== input.expectedRevision) {
      return fail('STALE_REVISION', 'This document changed. Reload the current revision and try again.');
    }
    if (['posted', 'posting', 'rejected'].includes(doc.status)) {
      return fail('STALE_REVISION', `Cannot submit facts from status ${doc.status}.`);
    }
    const policy = await this.deps.policyFor(actor.tenantId);
    const mapped = resolveCategoryMapping(policy, input.expenseAccountCode, input.categoryLabel);
    if (!mapped.ok) return mapped;
    const currency = input.currency || policy.currency;
    const net = money(input.netMinor ?? 0, currency);
    const tax = money(input.taxMinor ?? 0, currency);
    const gross = money(input.grossMinor ?? net.minor + tax.minor, currency);
    const extracted: ExtractedFacts = {
      supplierName: input.supplierName ? { value: input.supplierName, origin: 'user' } : undefined,
      supplierInvoiceNumber: input.supplierInvoiceNumber
        ? { value: input.supplierInvoiceNumber, origin: 'user' }
        : undefined,
      issueDate: input.issueDate ? { value: input.issueDate, origin: 'user' } : undefined,
      currency: { value: currency, origin: 'user' },
      paidStatus: { value: input.paidStatus ?? 'unknown', origin: 'user' },
      documentKind: { value: input.documentKind ?? 'unknown', origin: 'user' },
      net: { value: net, origin: 'user' },
      tax: { value: tax, origin: 'user' },
      gross: { value: gross, origin: 'user' },
      lineDescription: input.lineDescription ? { value: input.lineDescription, origin: 'user' } : undefined,
    };
    const facts = factsFromExtracted(extracted, policy);
    facts.expenseAccountCode = mapped.accountCode;
    facts.categoryLabel = mapped.label;
    if (input.invoiceKind) facts.invoiceKind = input.invoiceKind;
    const issues = issuesFromProposal(facts, policy);
    const next = blockingIssues(issues).length ? 'needs_clarification' : 'draft';
    if (doc.status !== next) assertTransition(doc.status, next);
    const oldProposalId = doc.proposalId;
    const proposalId = newId();
    const nextRevision = doc.proposalRevision + 1;
    const nextDoc: StoredDocument = {
      ...doc,
      facts: extracted,
      proposalId,
      proposalRevision: nextRevision,
      status: next,
      extractorId: input.origin === 'manual' ? MANUAL_FACTS_EXTRACTOR_ID : AGENT_FACTS_EXTRACTOR_ID,
      extractorLive: false,
      intakeMode: input.origin === 'manual' ? 'manual' : 'agent-facts',
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      updatedAt: new Date(this.now()).toISOString(),
    };
    if (this.deps.store.casDocument) {
      const swapped = await this.deps.store.casDocument(nextDoc, input.expectedRevision);
      if (!swapped) return fail('STALE_REVISION', 'This document changed. Reload the current revision and try again.');
    } else {
      await this.deps.store.saveDocument(nextDoc);
    }
    const proposal = await this.writeProposal(nextDoc, facts, issues, nextRevision, proposalId);
    if (oldProposalId) {
      await this.deps.store.revokeApprovalsForProposal(
        actor.tenantId,
        oldProposalId,
        new Date(this.now()).toISOString(),
      );
    }
    if (input.idempotencyKey && this.deps.store.saveFactsKey && !this.deps.store.claimFactsKey) {
      await this.deps.store.saveFactsKey({
        tenantId: actor.tenantId,
        key: `facts:${input.idempotencyKey}`,
        payloadHash,
        documentId: nextDoc.id,
      });
    }
    return { ok: true as const, document: nextDoc, proposal };
  }

  async createUploadSession(
    actor: Actor,
    input: { filename: string; mime: string; declaredBytes?: number; contentHash?: string; requestKey?: string },
  ) {
    actor = await this.authorized(actor, 'upload');
    const flags = await this.flags(actor.tenantId);
    if (!flags.enabled) return fail('FEATURE_DISABLED', 'AgentBridge is off for this company.');
    if (!ALLOWED_MIME.has(input.mime)) return fail('ATTACHMENT_REJECTED', `Unsupported type ${input.mime}.`);
    if (input.filename.includes('..') || input.filename.includes('/') || input.filename.includes('\\')) {
      return fail('ATTACHMENT_REJECTED', 'Unsafe filename.');
    }
    if (!this.deps.store.saveUploadSession || !this.deps.store.getUploadSession) {
      return fail('FEATURE_DISABLED', 'Upload sessions are not available on this store.');
    }
    const session: StoredUploadSession = {
      id: newId(),
      tenantId: actor.tenantId,
      userId: actor.userId,
      connectionId: actor.connectionId,
      filename: input.filename,
      mime: input.mime,
      declaredBytes: input.declaredBytes,
      expectedHash: input.contentHash,
      requestKey: input.requestKey,
      expiresAt: new Date(this.now() + UPLOAD_SESSION_TTL_MS).toISOString(),
      createdAt: new Date(this.now()).toISOString(),
    };
    await this.deps.store.saveUploadSession(session);
    const base = this.publicBase();
    const reviewPath = `/purchase/inbox?uploadSession=${session.id}`;
    return {
      ok: true as const,
      sessionId: session.id,
      expiresAt: session.expiresAt,
      reviewUrl: base ? `${base}${reviewPath}` : reviewPath,
      note: 'Open the review URL in BookOne while signed in, attach the original there, then resume with submit_extracted_facts. Chat attachments are not sent to this server automatically.',
    };
  }

  async finalizeUploadSession(
    actor: Actor,
    input: { sessionId: string; bytes?: Uint8Array; contentBase64?: string; allowDuplicate?: boolean },
  ) {
    actor = await this.authorized(actor, 'upload');
    if (!this.deps.store.getUploadSession || !this.deps.store.saveUploadSession) {
      return fail('FEATURE_DISABLED', 'Upload sessions are not available on this store.');
    }
    const session = await this.deps.store.getUploadSession(actor.tenantId, input.sessionId);
    if (!session || session.userId !== actor.userId) {
      return fail('UPLOAD_SESSION_EXPIRED', 'Upload session was not found for this connection.');
    }
    if (session.connectionId && actor.connectionId && session.connectionId !== actor.connectionId) {
      return fail('PERMISSION_DENIED', 'Upload session belongs to another connection.');
    }
    if (Date.parse(session.expiresAt) <= this.now()) {
      return fail('UPLOAD_SESSION_EXPIRED', 'Upload session expired. Create a new session.');
    }
    if (session.finalizedDocumentId) {
      const existing = await this.deps.store.getDocument(actor.tenantId, session.finalizedDocumentId);
      return { ok: true as const, document: existing, sessionId: session.id };
    }
    let bytes = input.bytes;
    if (!bytes && input.contentBase64) {
      const decoded = decodeBase64Strict(input.contentBase64);
      if (!decoded) return fail('ATTACHMENT_REJECTED', 'contentBase64 is not valid base64.');
      bytes = decoded;
    }
    if (!bytes) return fail('ATTACHMENT_REJECTED', 'Attach the original file bytes to finalize this session.');
    if (session.declaredBytes && bytes.byteLength !== session.declaredBytes) {
      return fail('ATTACHMENT_REJECTED', 'Uploaded byte length does not match the session declaration.');
    }
    if (session.expectedHash && sha256(bytes) !== session.expectedHash) {
      return fail('FACTS_HASH_MISMATCH', 'Uploaded bytes do not match the declared content hash.');
    }
    const submitted = await this.submitDocument(actor, {
      filename: session.filename,
      mime: session.mime,
      bytes,
      idempotencyKey: session.requestKey,
      allowDuplicate: input.allowDuplicate,
    });
    if (!submitted.ok) return submitted;
    session.finalizedDocumentId = submitted.document?.id;
    await this.deps.store.saveUploadSession(session);
    return submitted;
  }

  async submitBatchManifest(
    actor: Actor,
    input: {
      items: Array<{
        requestKey: string;
        filename: string;
        mime: string;
        contentBase64?: string;
        contentHash?: string;
      }>;
    },
  ) {
    actor = await this.authorized(actor, 'upload');
    const flags = await this.flags(actor.tenantId);
    if (!flags.enabled) return fail('FEATURE_DISABLED', 'AgentBridge is off for this company.');
    if (!this.deps.store.saveBatch || !this.deps.store.getBatch) {
      return fail('FEATURE_DISABLED', 'Batch manifests are not available on this store.');
    }
    const batch: StoredBatch = {
      id: newId(),
      tenantId: actor.tenantId,
      userId: actor.userId,
      items: input.items.map((item) => ({
        requestKey: item.requestKey,
        filename: item.filename,
        mime: item.mime,
        status: 'pending',
        contentHash: item.contentHash,
      })),
      createdAt: new Date(this.now()).toISOString(),
      updatedAt: new Date(this.now()).toISOString(),
    };
    for (let i = 0; i < input.items.length; i++) {
      const spec = input.items[i]!;
      const item = batch.items[i]!;
      const existing = this.deps.store.findBatchItemByKey
        ? await this.deps.store.findBatchItemByKey(actor.tenantId, spec.requestKey)
        : null;
      if (existing?.item.documentId && existing.item.status !== 'failed') {
        if (spec.contentHash && existing.item.contentHash && spec.contentHash !== existing.item.contentHash) {
          item.status = 'failed';
          item.error = 'This request key was used with a different file.';
          continue;
        }
        item.status = existing.item.status;
        item.documentId = existing.item.documentId;
        item.contentHash = existing.item.contentHash;
        continue;
      }
      if (!spec.contentBase64) {
        const session = await this.createUploadSession(actor, {
          filename: spec.filename,
          mime: spec.mime,
          contentHash: spec.contentHash,
          requestKey: spec.requestKey,
        });
        item.status = 'pending';
        item.error = session && 'reviewUrl' in session ? `Attach original at ${session.reviewUrl}` : 'Bytes missing.';
        continue;
      }
      const bytes = decodeBase64Strict(spec.contentBase64);
      if (!bytes) {
        item.status = 'failed';
        item.error = 'contentBase64 is not valid base64.';
        continue;
      }
      const submitted = await this.submitDocument(actor, {
        filename: spec.filename,
        mime: spec.mime,
        bytes,
        idempotencyKey: spec.requestKey,
      });
      if (!submitted.ok) {
        item.status = 'failed';
        item.error = submitted.error;
        continue;
      }
      item.status = submitted.document?.status === 'awaiting_facts' ? 'awaiting_facts' : 'received';
      item.documentId = submitted.document?.id;
      item.contentHash = submitted.document?.contentHash;
    }
    batch.updatedAt = new Date(this.now()).toISOString();
    await this.deps.store.saveBatch(batch);
    return {
      ok: true as const,
      batchId: batch.id,
      items: batch.items,
      note: 'Each item must be reviewed and approved separately. A batch is never approved as a whole.',
    };
  }

  async getBatchStatus(actor: Actor, batchId: string) {
    actor = await this.authorized(actor, 'read');
    const batch = this.deps.store.getBatch ? await this.deps.store.getBatch(actor.tenantId, batchId) : null;
    if (!batch) return fail('STALE_REVISION', 'Batch was not found.');
    return batch;
  }

  async lookupSuppliers(actor: Actor, input: { q?: string; limit?: number } = {}) {
    actor = await this.authorized(actor, 'read');
    const policy = await this.deps.policyFor(actor.tenantId);
    const q = (input.q ?? '').trim().toLowerCase();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    return policy.approvedSuppliers
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.partyId ?? '').toLowerCase().includes(q))
      .slice(0, limit)
      .map((s) => ({ name: s.name, partyId: s.partyId }));
  }

  async lookupExpenseAccounts(actor: Actor, input: { q?: string; limit?: number } = {}) {
    actor = await this.authorized(actor, 'read');
    const policy = await this.deps.policyFor(actor.tenantId);
    const q = (input.q ?? '').trim().toLowerCase();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    return policy.approvedCategories
      .filter((c) => !q || c.label.toLowerCase().includes(q) || c.accountCode.toLowerCase().includes(q))
      .slice(0, limit)
      .map((c) => ({ label: c.label, accountCode: c.accountCode }));
  }

  async listOwnProposals(actor: Actor, input: { q?: string; limit?: number } = {}) {
    actor = await this.authorized(actor, 'read');
    const docs = await this.deps.store.listDocuments(actor.tenantId);
    const mine = docs.filter((d) => d.userId === actor.userId);
    const q = (input.q ?? '').trim().toLowerCase();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    return mine
      .filter((d) => !q || d.filename.toLowerCase().includes(q) || d.status.includes(q))
      .slice(0, limit)
      .map((d) => ({
        documentId: d.id,
        filename: d.filename,
        status: d.status,
        proposalId: d.proposalId,
        proposalRevision: d.proposalRevision,
        updatedAt: d.updatedAt,
      }));
  }

  async listInbox(actor: Actor) {
    actor = await this.authorized(actor, 'read');
    return this.deps.store.listDocuments(actor.tenantId);
  }

  async proposePurchaseBill(actor: Actor, documentId: string) {
    actor = await this.authorized(actor, 'draft');
    const doc = await this.requireDoc(actor.tenantId, documentId);
    if (!doc.proposalId) {
      return fail(
        doc.status === 'awaiting_facts' || doc.lastErrorCode === 'PROVIDER_UNCONFIGURED'
          ? 'PROVIDER_UNCONFIGURED'
          : 'EXTRACTION_FAILED',
        doc.lastErrorMessage || 'No proposal yet. Submit invoice facts against this document.',
      );
    }
    return this.deps.store.getProposal(actor.tenantId, doc.proposalId);
  }

  async updateDraft(actor: Actor, input: { proposalId: string; expectedRevision: number; patch: Partial<ProposalFacts> }) {
    actor = await this.authorized(actor, 'draft');
    const bound = await this.requireCurrentProposal(actor.tenantId, input.proposalId);
    if (!bound.ok) return bound;
    const { proposal } = bound;
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
    const bound = await this.requireCurrentProposal(actor.tenantId, input.proposalId);
    if (!bound.ok) return bound;
    const { proposal } = bound;
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
    const bound = await this.requireCurrentProposal(actor.tenantId, proposalId);
    if (!bound.ok) return bound;
    const { proposal, doc } = bound;
    const policy = await this.deps.policyFor(actor.tenantId);
    proposal.issues = issuesFromProposal(proposal.facts, policy);
    const blocked = blockingIssues(proposal.issues);
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
    const bound = await this.requireCurrentProposal(actor.tenantId, proposalId);
    if (!bound.ok) return bound;
    const { proposal } = bound;
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
    const bound = await this.requireCurrentProposal(actor.tenantId, proposalId);
    if (!bound.ok) return bound;
    const preview = await this.getPreview(actor, proposalId);
    if ('ok' in preview && preview.ok === false) return preview;
    const doc = bound.doc;
    assertTransition(doc.status, 'awaiting_approval');
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
    const bound = await this.requireCurrentProposal(actor.tenantId, proposalId);
    if (!bound.ok) return bound;
    const { proposal, doc } = bound;
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

    const bound = await this.requireCurrentProposal(actor.tenantId, input.proposalId);
    if (!bound.ok) return bound;
    const { proposal, doc: currentDoc } = bound;
    if (currentDoc.proposalId !== proposal.id) {
      return fail('STALE_REVISION', 'This proposal is no longer the current revision of the document.');
    }
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

    const doc = currentDoc;
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
      // Keep the refusal on the document so the inbox explains it (QA-1126-08).
      doc.lastErrorCode = receipt.status === 'failed' ? 'POST_FAILED' : 'UNKNOWN_OUTCOME';
      doc.lastErrorMessage = message;
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

  private async requireCurrentProposal(tenantId: string, proposalId: string) {
    const proposal = await this.requireProposal(tenantId, proposalId);
    const doc = await this.requireDoc(tenantId, proposal.documentId);
    if (doc.proposalId !== proposal.id) {
      return fail('STALE_REVISION', 'This proposal is no longer the current revision of the document.');
    }
    return { ok: true as const, proposal, doc };
  }

  private async writeProposal(
    doc: StoredDocument,
    facts: ProposalFacts,
    issues: ReturnType<typeof issuesFromProposal>,
    revision = 1,
    id = newId(),
  ) {
    const proposal: StoredProposal = {
      id,
      tenantId: doc.tenantId,
      documentId: doc.id,
      revision,
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
  'submit_extracted_facts',
  'create_upload_session',
  'finalize_upload_session',
  'submit_batch_manifest',
  'get_batch_status',
  'lookup_suppliers',
  'lookup_expense_accounts',
  'list_own_proposals',
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

export const COMMERCE_READ_TOOL_NAMES = [
  'list_commerce_connections',
  'list_bookone_catalog',
  'get_mapping_summary',
] as const;

export const COMMERCE_PROPOSE_TOOL_NAMES = ['preview_mapping_proposal'] as const;

export const DESIGN_READ_TOOL_NAMES = [
  'list_print_items',
  'get_print_design_guide',
  'list_print_designs',
  'get_print_design',
  'check_print_assets',
] as const;

/** There is deliberately no delete, approve or "use" tool: those stay with a person in BookOne. */
export const DESIGN_WRITE_TOOL_NAMES = [
  'create_print_design',
  'save_print_design_version',
  'request_print_design_approval',
] as const;

export function toolsForActor(actor: { capabilities: Capability[] }): string[] {
  const names: string[] = [...TOOL_NAMES];
  if (actor.capabilities.includes('commerce_read')) names.push(...COMMERCE_READ_TOOL_NAMES);
  if (actor.capabilities.includes('commerce_propose')) names.push(...COMMERCE_PROPOSE_TOOL_NAMES);
  if (actor.capabilities.includes('design_read')) names.push(...DESIGN_READ_TOOL_NAMES);
  if (actor.capabilities.includes('design_write')) names.push(...DESIGN_WRITE_TOOL_NAMES);
  return names;
}

export function duplicateDocumentMessage(existing: { id: string; status: string; createdAt: string }): string {
  const day = existing.createdAt ? existing.createdAt.slice(0, 10) : 'an earlier date';
  return `This file was already received on ${day} (document ${existing.id.slice(0, 8)}, status ${existing.status.replaceAll('_', ' ')}). Open it, or upload again with "upload anyway" to keep a separate document.`;
}

function fail(code: string, error: string) {
  return { ok: false as const, code, error };
}

function isUncertainCommit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|ECONNRESET|EPIPE|uncertain|network|fetch failed/i.test(message);
}

function resolveCategoryMapping(
  policy: CompanyPolicy,
  code?: string,
  label?: string,
): { ok: true; accountCode: string; label: string } | { ok: false; code: string; error: string } {
  const cats = policy.approvedCategories;
  if (code && label) {
    const hit = cats.find((c) => c.accountCode === code && c.label === label);
    if (!hit) {
      return fail('AMBIGUOUS_CATEGORY', 'Expense account and category label do not match an authorized mapping.');
    }
    return { ok: true, accountCode: hit.accountCode, label: hit.label };
  }
  if (code) {
    const hits = cats.filter((c) => c.accountCode === code);
    if (hits.length === 1) return { ok: true, accountCode: hits[0]!.accountCode, label: hits[0]!.label };
    if (hits.length === 0) {
      return fail('AMBIGUOUS_CATEGORY', `Expense account ${code} is not an authorized mapping.`);
    }
    return fail(
      'AMBIGUOUS_CATEGORY',
      `Expense account ${code} maps to more than one category. Send the category label.`,
    );
  }
  if (label) {
    const hits = cats.filter((c) => c.label === label);
    if (hits.length === 1) return { ok: true, accountCode: hits[0]!.accountCode, label: hits[0]!.label };
    if (hits.length === 0) return fail('AMBIGUOUS_CATEGORY', `Category ${label} is not an authorized mapping.`);
    return fail('AMBIGUOUS_CATEGORY', `Category ${label} maps to more than one account. Send the account code.`);
  }
  const defaults = cats.filter((c) => c.accountCode === policy.defaultExpenseAccount);
  if (defaults.length === 1) return { ok: true, accountCode: defaults[0]!.accountCode, label: defaults[0]!.label };
  if (cats[0]) return { ok: true, accountCode: cats[0].accountCode, label: cats[0].label };
  return { ok: true, accountCode: policy.defaultExpenseAccount ?? '', label: '' };
}

function factsFromExtracted(
  extracted: NonNullable<StoredDocument['facts']>,
  policy: CompanyPolicy,
): ProposalFacts {
  const mapped = resolveCategoryMapping(policy);
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
    expenseAccountCode: mapped.ok ? mapped.accountCode : policy.approvedCategories[0]?.accountCode ?? '',
    categoryLabel: mapped.ok ? mapped.label : policy.approvedCategories[0]?.label ?? '',
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
  if (
    (status === 'awaiting_facts' ||
      status === 'failed' ||
      status === 'received' ||
      status === 'draft' ||
      status === 'validated' ||
      status === 'awaiting_approval' ||
      status === 'needs_clarification') &&
    actor.capabilities.includes('draft')
  ) {
    out.push('submit_extracted_facts');
  }
  if (status === 'failed' && actor.capabilities.includes('draft')) out.push('process_document');
  if (status === 'needs_clarification' && actor.capabilities.includes('draft')) out.push('answer_issue', 'update_draft');
  if (status === 'draft' || status === 'validated') {
    if (actor.capabilities.includes('draft')) out.push('validate_proposal', 'get_preview', 'request_approval');
  }
  if (status === 'awaiting_approval' && actor.capabilities.includes('approve')) out.push('grant_approval');
  if (status === 'awaiting_approval' && actor.capabilities.includes('post')) out.push('commit_approved_proposal');
  if (status === 'posted') out.push('get_receipt');
  return out;
}

function mimeSignatureOk(mime: string, bytes: Uint8Array): boolean {
  if (bytes.byteLength >= 8) {
    const head = Buffer.from(bytes.subarray(0, 8)).toString('ascii');
    if (head.startsWith('fixture:')) return true;
  }
  if (mime === 'application/pdf') {
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  }
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mime === 'image/png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mime === 'image/webp') {
    return (
      bytes.byteLength > 12 &&
      Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' &&
      Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

function decodeBase64Strict(value: string): Uint8Array | null {
  if (!value || /[^A-Za-z0-9+/_=-]/.test(value)) return null;
  try {
    const buf = Buffer.from(value, 'base64');
    if (buf.byteLength === 0) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

function sanitizeExtractorMessage(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/AGENT_BRIDGE_OCR_KEY\S*/gi, 'OCR key [redacted]')
    .replace(/https?:\/\/\S+/gi, '[endpoint]')
    .slice(0, 280);
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
