import { createHash, randomUUID } from 'node:crypto';
import type {
  ApprovalRecord,
  Capability,
  DocumentState,
  ExtractedFacts,
  FeatureFlags,
  IntakeMode,
  Issue,
  OperationReceipt,
  PreviewEffect,
  ProposalFacts,
} from './contracts';
export { DEFAULT_FLAGS } from './contracts';

export type StoredDocument = {
  id: string;
  tenantId: string;
  userId: string;
  status: DocumentState;
  contentHash: string;
  storageKey: string;
  filename: string;
  mime: string;
  bytes: number;
  extractorId?: string;
  extractorLive?: boolean;
  facts?: ExtractedFacts;
  proposalId?: string;
  proposalRevision: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  intakeMode?: IntakeMode;
  createdAt: string;
  updatedAt: string;
};

export type StoredUploadSession = {
  id: string;
  tenantId: string;
  userId: string;
  connectionId?: string;
  filename: string;
  mime: string;
  declaredBytes?: number;
  expectedHash?: string;
  requestKey?: string;
  bytes?: Uint8Array;
  expiresAt: string;
  finalizedDocumentId?: string;
  createdAt: string;
};

export type StoredBatchItem = {
  requestKey: string;
  filename: string;
  mime: string;
  status: 'pending' | 'received' | 'awaiting_facts' | 'failed' | 'done';
  documentId?: string;
  error?: string;
  contentHash?: string;
};

export type StoredBatch = {
  id: string;
  tenantId: string;
  userId: string;
  items: StoredBatchItem[];
  createdAt: string;
  updatedAt: string;
};

export type StoredFactsKey = {
  tenantId: string;
  key: string;
  payloadHash: string;
  documentId: string;
};

export type StoredConnection = {
  id: string;
  tenantId: string;
  userId: string;
  clientId: string;
  scopes: Capability[];
  label?: string;
  lastUsedAt?: string;
  revokedAt?: string;
  createdAt: string;
};

export type StoredProposal = {
  id: string;
  tenantId: string;
  documentId: string;
  revision: number;
  hash: string;
  facts: ProposalFacts;
  preview?: PreviewEffect;
  issues: Issue[];
  answered: Record<string, string>;
};

export type StoredOperation = {
  id: string;
  tenantId: string;
  idempotencyKey: string;
  payloadHash: string;
  proposalId: string;
  approvalId?: string;
  receipt: OperationReceipt;
};

export type StoredJob = {
  id: string;
  tenantId: string;
  documentId: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export const ACTIVE_OPERATION_STATUSES = ['posting', 'posted', 'unknown_outcome'] as const;

export function isActiveOperationStatus(status: OperationReceipt['status']): boolean {
  return (ACTIVE_OPERATION_STATUSES as readonly string[]).includes(status);
}

export type StoredBlob = {
  key: string;
  tenantId: string;
  bytes: Uint8Array;
  mime: string;
  filename: string;
};

export interface AgentBridgeStore {
  flags(tenantId: string): Promise<FeatureFlags>;
  setFlags(tenantId: string, flags: FeatureFlags): Promise<void>;
  getDocument(tenantId: string, id: string): Promise<StoredDocument | null>;
  listDocuments(tenantId: string): Promise<StoredDocument[]>;
  findByHash(tenantId: string, hash: string): Promise<StoredDocument | null>;
  saveDocument(doc: StoredDocument): Promise<void>;
  getProposal(tenantId: string, id: string): Promise<StoredProposal | null>;
  saveProposal(p: StoredProposal): Promise<void>;
  getApproval(tenantId: string, id: string): Promise<ApprovalRecord | null>;
  findApprovalForProposal(tenantId: string, proposalId: string): Promise<ApprovalRecord | null>;
  saveApproval(a: ApprovalRecord): Promise<void>;
  getOperation(tenantId: string, id: string): Promise<StoredOperation | null>;
  getOperationByKey(tenantId: string, key: string): Promise<StoredOperation | null>;
  findOperationForProposal(tenantId: string, proposalId: string): Promise<StoredOperation | null>;
  saveOperation(op: StoredOperation): Promise<void>;
  claimCommit(op: StoredOperation): Promise<{ claimed: true } | { claimed: false; existing: StoredOperation }>;
  revokeApprovalsForProposal(tenantId: string, proposalId: string, nowIso: string): Promise<void>;
  putBlob(blob: StoredBlob): Promise<void>;
  getBlob(tenantId: string, key: string): Promise<StoredBlob | null>;
  saveJob(job: StoredJob): Promise<void>;
  getJob(tenantId: string, id: string): Promise<StoredJob | null>;
  listJobs(tenantId: string): Promise<StoredJob[]>;
  saveUploadSession?(session: StoredUploadSession): Promise<void>;
  getUploadSession?(tenantId: string, id: string): Promise<StoredUploadSession | null>;
  saveBatch?(batch: StoredBatch): Promise<void>;
  getBatch?(tenantId: string, id: string): Promise<StoredBatch | null>;
  findBatchItemByKey?(tenantId: string, requestKey: string): Promise<{ batch: StoredBatch; item: StoredBatchItem } | null>;
  saveFactsKey?(row: StoredFactsKey): Promise<void>;
  getFactsKey?(tenantId: string, key: string): Promise<StoredFactsKey | null>;
  claimFactsKey?(
    row: StoredFactsKey,
  ): Promise<{ claimed: true } | { claimed: false; existing: StoredFactsKey }>;
  casDocument?(doc: StoredDocument, expectedRevision: number): Promise<boolean>;
  listConnections?(tenantId: string, userId?: string): Promise<StoredConnection[]>;
  saveConnection?(row: StoredConnection): Promise<void>;
  getConnection?(tenantId: string, id: string): Promise<StoredConnection | null>;
}

export class MemoryStore implements AgentBridgeStore {
  flagsByTenant = new Map<string, FeatureFlags>();
  docs = new Map<string, StoredDocument>();
  proposals = new Map<string, StoredProposal>();
  approvals = new Map<string, ApprovalRecord>();
  ops = new Map<string, StoredOperation>();
  blobs = new Map<string, StoredBlob>();
  jobs = new Map<string, StoredJob>();
  sessions = new Map<string, StoredUploadSession>();
  batches = new Map<string, StoredBatch>();
  factsKeys = new Map<string, StoredFactsKey>();
  connections = new Map<string, StoredConnection>();

  async flags(tenantId: string) {
    return (
      this.flagsByTenant.get(tenantId) ?? {
        enabled: false,
        draftOnly: true,
        postingDisabled: true,
      }
    );
  }
  async setFlags(tenantId: string, flags: FeatureFlags) {
    this.flagsByTenant.set(tenantId, flags);
  }
  async getDocument(tenantId: string, id: string) {
    const d = this.docs.get(id);
    return d && d.tenantId === tenantId ? d : null;
  }
  async listDocuments(tenantId: string) {
    return [...this.docs.values()].filter((d) => d.tenantId === tenantId);
  }
  async findByHash(tenantId: string, hash: string) {
    return [...this.docs.values()].find((d) => d.tenantId === tenantId && d.contentHash === hash) ?? null;
  }
  async saveDocument(doc: StoredDocument) {
    this.docs.set(doc.id, doc);
  }
  async casDocument(doc: StoredDocument, expectedRevision: number) {
    const current = this.docs.get(doc.id);
    if (!current || current.tenantId !== doc.tenantId) return false;
    if (current.proposalRevision !== expectedRevision) return false;
    this.docs.set(doc.id, doc);
    return true;
  }
  async getProposal(tenantId: string, id: string) {
    const p = this.proposals.get(id);
    return p && p.tenantId === tenantId ? p : null;
  }
  async saveProposal(p: StoredProposal) {
    this.proposals.set(p.id, p);
  }
  async getApproval(tenantId: string, id: string) {
    const a = this.approvals.get(id);
    return a && a.tenantId === tenantId ? a : null;
  }
  async findApprovalForProposal(tenantId: string, proposalId: string) {
    return (
      [...this.approvals.values()].find(
        (a) => a.tenantId === tenantId && a.proposalId === proposalId && !a.revokedAt,
      ) ?? null
    );
  }
  async saveApproval(a: ApprovalRecord) {
    this.approvals.set(a.id, a);
  }
  async getOperation(tenantId: string, id: string) {
    const o = this.ops.get(id);
    return o && o.tenantId === tenantId ? o : null;
  }
  async getOperationByKey(tenantId: string, key: string) {
    return [...this.ops.values()].find((o) => o.tenantId === tenantId && o.idempotencyKey === key) ?? null;
  }
  async findOperationForProposal(tenantId: string, proposalId: string) {
    return [...this.ops.values()].find((o) => o.tenantId === tenantId && o.proposalId === proposalId) ?? null;
  }
  async saveOperation(op: StoredOperation) {
    this.ops.set(op.id, op);
  }
  async claimCommit(op: StoredOperation) {
    const existingActive = [...this.ops.values()].find(
      (o) => o.tenantId === op.tenantId && o.proposalId === op.proposalId && isActiveOperationStatus(o.receipt.status),
    );
    if (existingActive) return { claimed: false as const, existing: existingActive };
    const byKey = [...this.ops.values()].find(
      (o) => o.tenantId === op.tenantId && o.idempotencyKey === op.idempotencyKey,
    );
    if (byKey) return { claimed: false as const, existing: byKey };
    this.ops.set(op.id, { ...op, receipt: { ...op.receipt } });
    return { claimed: true as const };
  }
  async revokeApprovalsForProposal(tenantId: string, proposalId: string, nowIso: string) {
    for (const a of this.approvals.values()) {
      if (a.tenantId === tenantId && a.proposalId === proposalId && !a.revokedAt) {
        a.revokedAt = nowIso;
      }
    }
  }
  async saveJob(job: StoredJob) {
    this.jobs.set(job.id, job);
  }
  async getJob(tenantId: string, id: string) {
    const j = this.jobs.get(id);
    return j && j.tenantId === tenantId ? j : null;
  }
  async listJobs(tenantId: string) {
    return [...this.jobs.values()].filter((j) => j.tenantId === tenantId);
  }
  async putBlob(blob: StoredBlob) {
    this.blobs.set(blob.key, blob);
  }
  async getBlob(tenantId: string, key: string) {
    const b = this.blobs.get(key);
    return b && b.tenantId === tenantId ? b : null;
  }
  async saveUploadSession(session: StoredUploadSession) {
    this.sessions.set(session.id, session);
  }
  async getUploadSession(tenantId: string, id: string) {
    const s = this.sessions.get(id);
    return s && s.tenantId === tenantId ? s : null;
  }
  async saveBatch(batch: StoredBatch) {
    this.batches.set(batch.id, batch);
  }
  async getBatch(tenantId: string, id: string) {
    const b = this.batches.get(id);
    return b && b.tenantId === tenantId ? b : null;
  }
  async findBatchItemByKey(tenantId: string, requestKey: string) {
    for (const batch of this.batches.values()) {
      if (batch.tenantId !== tenantId) continue;
      const item = batch.items.find((i) => i.requestKey === requestKey);
      if (item) return { batch, item };
    }
    return null;
  }
  async saveFactsKey(row: StoredFactsKey) {
    const k = `${row.tenantId}:${row.key}`;
    if (this.factsKeys.has(k)) return;
    this.factsKeys.set(k, row);
  }
  async claimFactsKey(row: StoredFactsKey) {
    const k = `${row.tenantId}:${row.key}`;
    const existing = this.factsKeys.get(k);
    if (existing) return { claimed: false as const, existing };
    this.factsKeys.set(k, row);
    return { claimed: true as const };
  }
  async getFactsKey(tenantId: string, key: string) {
    return this.factsKeys.get(`${tenantId}:${key}`) ?? null;
  }
  async listConnections(tenantId: string, userId?: string) {
    return [...this.connections.values()].filter(
      (c) => c.tenantId === tenantId && (!userId || c.userId === userId),
    );
  }
  async saveConnection(row: StoredConnection) {
    this.connections.set(row.id, row);
  }
  async getConnection(tenantId: string, id: string) {
    const c = this.connections.get(id);
    return c && c.tenantId === tenantId ? c : null;
  }
}

export function newId(): string {
  return randomUUID();
}

export function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function ownedStorageKey(tenantId: string, filename: string, id: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return `tenants/${tenantId}/agent-bridge/${id}-${safe}`;
}

export function isOwnedAgentBridgeKey(tenantId: string, key: string): boolean {
  return key.startsWith(`tenants/${tenantId}/agent-bridge/`) && !key.includes('..');
}
