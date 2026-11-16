import { createHash, randomUUID } from 'node:crypto';
import type {
  ApprovalRecord,
  DocumentState,
  ExtractedFacts,
  FeatureFlags,
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
  createdAt: string;
  updatedAt: string;
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
}

export class MemoryStore implements AgentBridgeStore {
  flagsByTenant = new Map<string, FeatureFlags>();
  docs = new Map<string, StoredDocument>();
  proposals = new Map<string, StoredProposal>();
  approvals = new Map<string, ApprovalRecord>();
  ops = new Map<string, StoredOperation>();
  blobs = new Map<string, StoredBlob>();
  jobs = new Map<string, StoredJob>();

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
