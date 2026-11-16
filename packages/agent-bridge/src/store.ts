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
  putBlob(blob: StoredBlob): Promise<void>;
  getBlob(tenantId: string, key: string): Promise<StoredBlob | null>;
}

export class MemoryStore implements AgentBridgeStore {
  flagsByTenant = new Map<string, FeatureFlags>();
  docs = new Map<string, StoredDocument>();
  proposals = new Map<string, StoredProposal>();
  approvals = new Map<string, ApprovalRecord>();
  ops = new Map<string, StoredOperation>();
  blobs = new Map<string, StoredBlob>();

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
