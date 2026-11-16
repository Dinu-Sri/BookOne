import {
  AgentBridgeService,
  MemoryStore,
  defaultPolicy,
  extractorFor,
  type Actor,
  type AgentBridgeStore,
  type Capability,
  type CompanyPolicy,
  type FeatureFlags,
  type PostingPort,
  parseScopes,
} from '@bookone/agent-bridge';
import { requireTenantContext } from '@bookone/auth';
import {
  agentBridgeApprovals,
  agentBridgeBlobs,
  agentBridgeDocuments,
  agentBridgeOperations,
  agentBridgeProposals,
  agentBridgeSettings,
  and,
  db,
  eq,
  purchaseSettings,
  salesSettings,
  users,
  withTenantContext,
} from '@bookone/db';
import { getMyAccess } from '@/lib/access';
import { createCommercialDocumentWithUser } from '@/app/actions/commercial-docs';
import { minorToMajor, type StoredDocument, type StoredProposal, type StoredOperation } from '@bookone/agent-bridge';
import type { ApprovalRecord } from '@bookone/agent-bridge';

const memory = new MemoryStore();

export function agentBridgeTokenSecret(): string {
  return process.env.AGENT_BRIDGE_TOKEN_SECRET || process.env.AUTH_SECRET || 'dev-only-agent-bridge';
}

export async function loadAgentBridgeFlags(tenantId: string): Promise<FeatureFlags> {
  try {
    const [row] = await db()
      .select()
      .from(agentBridgeSettings)
      .where(eq(agentBridgeSettings.tenantId, tenantId))
      .limit(1);
    if (!row) return { enabled: false, draftOnly: true, postingDisabled: true };
    return {
      enabled: row.enabled === '1',
      draftOnly: row.draftOnly !== '0',
      postingDisabled: row.postingDisabled !== '0',
    };
  } catch {
    return memory.flags(tenantId);
  }
}

export async function saveAgentBridgeFlags(tenantId: string, flags: FeatureFlags): Promise<void> {
  const values = {
    enabled: flags.enabled ? '1' : '0',
    draftOnly: flags.draftOnly ? '1' : '0',
    postingDisabled: flags.postingDisabled ? '1' : '0',
    updatedAt: new Date(),
  };
  const [existing] = await db()
    .select({ tenantId: agentBridgeSettings.tenantId })
    .from(agentBridgeSettings)
    .where(eq(agentBridgeSettings.tenantId, tenantId))
    .limit(1);
  if (existing) {
    await db().update(agentBridgeSettings).set(values).where(eq(agentBridgeSettings.tenantId, tenantId));
  } else {
    await db().insert(agentBridgeSettings).values({ tenantId, ...values });
  }
  await memory.setFlags(tenantId, flags);
}

export async function policyForTenant(tenantId: string): Promise<CompanyPolicy> {
  const [tax] = await db().select().from(salesSettings).where(eq(salesSettings.tenantId, tenantId)).limit(1);
  const [purchase] = await db()
    .select()
    .from(purchaseSettings)
    .where(eq(purchaseSettings.tenantId, tenantId))
    .limit(1);
  return defaultPolicy({
    vatRegistered: tax?.vatRegistered === '1',
    vatRatePercent: Number(tax?.vatRatePercent ?? 18) || 18,
    defaultExpenseAccount: purchase?.defaultExpenseAccount || '6800',
    currency: 'LKR',
  });
}

class PostgresStore implements AgentBridgeStore {
  async flags(tenantId: string) {
    return loadAgentBridgeFlags(tenantId);
  }
  async setFlags(tenantId: string, flags: FeatureFlags) {
    await saveAgentBridgeFlags(tenantId, flags);
  }
  async getDocument(tenantId: string, id: string) {
    const [row] = await db()
      .select()
      .from(agentBridgeDocuments)
      .where(and(eq(agentBridgeDocuments.tenantId, tenantId), eq(agentBridgeDocuments.id, id)))
      .limit(1);
    return row ? mapDoc(row) : null;
  }
  async listDocuments(tenantId: string) {
    const rows = await db()
      .select()
      .from(agentBridgeDocuments)
      .where(eq(agentBridgeDocuments.tenantId, tenantId));
    return rows.map(mapDoc);
  }
  async findByHash(tenantId: string, hash: string) {
    const [row] = await db()
      .select()
      .from(agentBridgeDocuments)
      .where(and(eq(agentBridgeDocuments.tenantId, tenantId), eq(agentBridgeDocuments.contentHash, hash)))
      .limit(1);
    return row ? mapDoc(row) : null;
  }
  async saveDocument(d: StoredDocument) {
    const values = {
      tenantId: d.tenantId,
      userId: d.userId,
      status: d.status,
      contentHash: d.contentHash,
      storageKey: d.storageKey,
      filename: d.filename,
      mime: d.mime,
      bytes: d.bytes,
      extractorId: d.extractorId,
      extractorLive: d.extractorLive ? '1' : '0',
      factsJson: d.facts ?? null,
      proposalId: d.proposalId,
      proposalRevision: d.proposalRevision,
      updatedAt: new Date(),
    };
    const existing = await this.getDocument(d.tenantId, d.id);
    if (existing) {
      await db().update(agentBridgeDocuments).set(values).where(eq(agentBridgeDocuments.id, d.id));
    } else {
      await db().insert(agentBridgeDocuments).values({ id: d.id, createdAt: new Date(d.createdAt), ...values });
    }
  }
  async getProposal(tenantId: string, id: string) {
    const [row] = await db()
      .select()
      .from(agentBridgeProposals)
      .where(and(eq(agentBridgeProposals.tenantId, tenantId), eq(agentBridgeProposals.id, id)))
      .limit(1);
    return row ? mapProposal(row) : null;
  }
  async saveProposal(p: StoredProposal) {
    const values = {
      tenantId: p.tenantId,
      documentId: p.documentId,
      revision: p.revision,
      hash: p.hash,
      factsJson: p.facts,
      previewJson: p.preview ?? null,
      issuesJson: p.issues,
      answeredJson: p.answered,
    };
    const existing = await this.getProposal(p.tenantId, p.id);
    if (existing) {
      await db().update(agentBridgeProposals).set(values).where(eq(agentBridgeProposals.id, p.id));
    } else {
      await db().insert(agentBridgeProposals).values({ id: p.id, ...values });
    }
  }
  async getApproval(tenantId: string, id: string) {
    const [row] = await db()
      .select()
      .from(agentBridgeApprovals)
      .where(and(eq(agentBridgeApprovals.tenantId, tenantId), eq(agentBridgeApprovals.id, id)))
      .limit(1);
    return row ? mapApproval(row) : null;
  }
  async findApprovalForProposal(tenantId: string, proposalId: string) {
    const rows = await db()
      .select()
      .from(agentBridgeApprovals)
      .where(and(eq(agentBridgeApprovals.tenantId, tenantId), eq(agentBridgeApprovals.proposalId, proposalId)));
    const hit = rows.find((r) => !r.revokedAt);
    return hit ? mapApproval(hit) : null;
  }
  async saveApproval(a: ApprovalRecord) {
    const values = {
      tenantId: a.tenantId,
      proposalId: a.proposalId,
      proposalHash: a.proposalHash,
      previewVersion: a.previewVersion,
      policyVersion: a.policyVersion,
      actorUserId: a.actorUserId,
      grantedAt: new Date(a.grantedAt),
      expiresAt: new Date(a.expiresAt),
      revokedAt: a.revokedAt ? new Date(a.revokedAt) : null,
    };
    const existing = await this.getApproval(a.tenantId, a.id);
    if (existing) {
      await db().update(agentBridgeApprovals).set(values).where(eq(agentBridgeApprovals.id, a.id));
    } else {
      await db().insert(agentBridgeApprovals).values({ id: a.id, ...values });
    }
  }
  async getOperation(tenantId: string, id: string) {
    const [row] = await db()
      .select()
      .from(agentBridgeOperations)
      .where(and(eq(agentBridgeOperations.tenantId, tenantId), eq(agentBridgeOperations.id, id)))
      .limit(1);
    return row ? mapOp(row) : null;
  }
  async getOperationByKey(tenantId: string, key: string) {
    const [row] = await db()
      .select()
      .from(agentBridgeOperations)
      .where(and(eq(agentBridgeOperations.tenantId, tenantId), eq(agentBridgeOperations.idempotencyKey, key)))
      .limit(1);
    return row ? mapOp(row) : null;
  }
  async findOperationForProposal(tenantId: string, proposalId: string) {
    const [row] = await db()
      .select()
      .from(agentBridgeOperations)
      .where(and(eq(agentBridgeOperations.tenantId, tenantId), eq(agentBridgeOperations.proposalId, proposalId)))
      .limit(1);
    return row ? mapOp(row) : null;
  }
  async saveOperation(op: StoredOperation) {
    const values = {
      tenantId: op.tenantId,
      idempotencyKey: op.idempotencyKey,
      payloadHash: op.payloadHash,
      proposalId: op.proposalId,
      approvalId: op.approvalId,
      receiptJson: op.receipt,
    };
    const existing = await this.getOperation(op.tenantId, op.id);
    if (existing) {
      await db().update(agentBridgeOperations).set(values).where(eq(agentBridgeOperations.id, op.id));
    } else {
      await db().insert(agentBridgeOperations).values({ id: op.id, ...values });
    }
  }
  async putBlob(blob: { key: string; tenantId: string; bytes: Uint8Array; mime: string; filename: string }) {
    const content = Buffer.from(blob.bytes).toString('base64');
    const existing = await this.getBlob(blob.tenantId, blob.key);
    const values = {
      mime: blob.mime,
      filename: blob.filename,
      bytes: blob.bytes.byteLength,
      content,
    };
    if (existing) {
      await db().update(agentBridgeBlobs).set(values).where(eq(agentBridgeBlobs.key, blob.key));
    } else {
      await db().insert(agentBridgeBlobs).values({ key: blob.key, tenantId: blob.tenantId, ...values });
    }
  }
  async getBlob(tenantId: string, key: string) {
    const [row] = await db()
      .select()
      .from(agentBridgeBlobs)
      .where(and(eq(agentBridgeBlobs.tenantId, tenantId), eq(agentBridgeBlobs.key, key)))
      .limit(1);
    if (!row) return null;
    return {
      key: row.key,
      tenantId: row.tenantId,
      mime: row.mime,
      filename: row.filename,
      bytes: new Uint8Array(Buffer.from(row.content, 'base64')),
    };
  }
}

function mapDoc(row: typeof agentBridgeDocuments.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    status: row.status as never,
    contentHash: row.contentHash,
    storageKey: row.storageKey,
    filename: row.filename,
    mime: row.mime,
    bytes: row.bytes,
    extractorId: row.extractorId ?? undefined,
    extractorLive: row.extractorLive === '1',
    facts: (row.factsJson as never) ?? undefined,
    proposalId: row.proposalId ?? undefined,
    proposalRevision: row.proposalRevision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapProposal(row: typeof agentBridgeProposals.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    documentId: row.documentId,
    revision: row.revision,
    hash: row.hash,
    facts: row.factsJson as never,
    preview: (row.previewJson as never) ?? undefined,
    issues: row.issuesJson as never,
    answered: (row.answeredJson as Record<string, string>) ?? {},
  };
}

function mapApproval(row: typeof agentBridgeApprovals.$inferSelect) {
  return {
    id: row.id,
    proposalId: row.proposalId,
    proposalHash: row.proposalHash,
    previewVersion: row.previewVersion,
    policyVersion: row.policyVersion,
    actorUserId: row.actorUserId,
    tenantId: row.tenantId,
    grantedAt: row.grantedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : undefined,
  };
}

function mapOp(row: typeof agentBridgeOperations.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    idempotencyKey: row.idempotencyKey,
    payloadHash: row.payloadHash,
    proposalId: row.proposalId,
    approvalId: row.approvalId ?? undefined,
    receipt: row.receiptJson as never,
  };
}

async function sessionUserForActor(actor: Actor) {
  try {
    return await requireTenantContext();
  } catch {
    const [row] = await db().select().from(users).where(eq(users.id, actor.userId)).limit(1);
    if (!row) throw new Error('Actor is not a BookOne user in this company.');
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      tenantId: actor.tenantId,
      homeTenantId: actor.tenantId,
      role: 'user',
      platformRole: 'user' as const,
      jobSlug: null,
      jobId: null,
    };
  }
}

function webPostingPort(): PostingPort {
  return {
    async commitPurchaseBill(input) {
      const user = await sessionUserForActor(input.actor);
      if (user.tenantId !== input.actor.tenantId) {
        throw new Error('Actor tenant does not match the posting session.');
      }
      const net = minorToMajor(input.facts.net);
      const result = await createCommercialDocumentWithUser(
        user,
        {
          documentType: 'purchase',
          partyName: input.facts.supplierName,
          issueDate: input.facts.issueDate,
          invoiceKind: input.facts.invoiceKind,
          supplierInvoiceNumber: input.facts.supplierInvoiceNumber,
          notes: `AgentBridge ${input.preview.previewVersion}`,
          intent: 'post',
          idempotencyKey: input.idempotencyKey,
          lines: [
            {
              description: input.facts.lineDescription || 'Supplier service',
              quantity: 1,
              unitPrice: net,
              accountCode: input.facts.expenseAccountCode,
            },
          ],
        },
        { alreadyAuthorized: true },
      );
      if (!result.ok || !result.id) throw new Error(result.error || 'Purchase bill was not posted.');
      return { billId: result.id, documentNumber: result.id.slice(0, 8).toUpperCase() };
    },
  };
}

export async function actorFromSession(): Promise<Actor> {
  const user = await requireTenantContext();
  const access = await getMyAccess();
  const keys: string[] = [];
  if (access?.allows('purchase.inbox.read', 'read')) keys.push('purchase.inbox.read');
  if (access?.allows('purchase.inbox.write', 'write')) keys.push('purchase.inbox.write');
  if (access?.allows('agent_bridge.approve', 'write')) keys.push('agent_bridge.approve');
  if (access?.allows('agent_bridge.post', 'write')) keys.push('agent_bridge.post');
  if (access?.allows('purchase.bills.write', 'write')) keys.push('purchase.bills.write');
  const capabilities = parseScopes(keys);
  return {
    userId: user.id,
    tenantId: user.tenantId,
    capabilities: capabilities.length ? capabilities : (['read'] as Capability[]),
  };
}

export function makeAgentBridgeService(): AgentBridgeService {
  const store: AgentBridgeStore = process.env.AGENT_BRIDGE_STORE === 'memory' ? memory : new PostgresStore();
  return new AgentBridgeService({
    store,
    extractor: extractorFor(process.env),
    posting: webPostingPort(),
    policyFor: policyForTenant,
  });
}

export async function getAgentBridgeService(): Promise<{ service: AgentBridgeService; actor: Actor }> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    return { service: makeAgentBridgeService(), actor: await actorFromSession() };
  });
}

export async function getAgentBridgeServiceForActor(actor: Actor): Promise<AgentBridgeService> {
  return withTenantContext(actor.tenantId, async () => makeAgentBridgeService());
}

export { memory as agentBridgeMemoryStore };
