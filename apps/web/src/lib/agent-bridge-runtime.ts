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
  type OperationReceipt,
  type PostingPort,
  parseScopes,
} from '@bookone/agent-bridge';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  agentBridgeApprovals,
  agentBridgeBlobs,
  agentBridgeConnections,
  agentBridgeDocuments,
  agentBridgeJobs,
  agentBridgeOperations,
  agentBridgeProposals,
  agentBridgeSettings,
  and,
  companyProfiles,
  db,
  eq,
  isNull,
  opsIdempotency,
  parties,
  purchaseSettings,
  salesSettings,
  tenantMemberships,
  users,
  withTenantContext,
} from '@bookone/db';
import { getMyAccess } from '@/lib/access';
import { createCommercialDocumentWithUser } from '@/app/actions/commercial-docs';
import {
  isActiveOperationStatus,
  minorToMajor,
  type StoredDocument,
  type StoredJob,
  type StoredProposal,
  type StoredOperation,
} from '@bookone/agent-bridge';
import type { ApprovalRecord } from '@bookone/agent-bridge';

const memory = new MemoryStore();

export function agentBridgeTokenSecret(): string {
  const secret = process.env.AGENT_BRIDGE_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw Object.assign(new Error('AGENT_BRIDGE_TOKEN_SECRET or AUTH_SECRET is required.'), { code: 'TOKEN_INVALID' });
  }
  return secret;
}

function scoped<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return withTenantContext(tenantId, fn);
}

function parseVatRatePercent(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 18;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 18;
  return n;
}

export async function loadAgentBridgeFlags(tenantId: string): Promise<FeatureFlags> {
  try {
    return await scoped(tenantId, async () => {
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
    });
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
  await scoped(tenantId, async () => {
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
  });
  await memory.setFlags(tenantId, flags);
}

export async function policyForTenant(tenantId: string): Promise<CompanyPolicy> {
  return scoped(tenantId, async () => {
    const [tax] = await db().select().from(salesSettings).where(eq(salesSettings.tenantId, tenantId)).limit(1);
    const [purchase] = await db()
      .select()
      .from(purchaseSettings)
      .where(eq(purchaseSettings.tenantId, tenantId))
      .limit(1);
    const [profile] = await db()
      .select()
      .from(companyProfiles)
      .where(eq(companyProfiles.tenantId, tenantId))
      .limit(1);
    const vendors = await db()
      .select({ id: parties.id, name: parties.name })
      .from(parties)
      .where(and(eq(parties.tenantId, tenantId), eq(parties.isVendor, '1'), isNull(parties.voidedAt)));
    const expenses = await db()
      .select({ code: accounts.code, name: accounts.name })
      .from(accounts)
      .where(
        and(
          eq(accounts.tenantId, tenantId),
          eq(accounts.type, 'expense'),
          eq(accounts.isActive, '1'),
          isNull(accounts.voidedAt),
        ),
      );
    const defaultExpense = purchase?.defaultExpenseAccount || expenses.find((a) => a.code === '6800')?.code || expenses[0]?.code || '';
    return {
      currency: profile?.baseCurrency || 'LKR',
      vatRegistered: tax?.vatRegistered === '1',
      vatRatePercent: parseVatRatePercent(tax?.vatRatePercent),
      jurisdiction: 'LK',
      defaultExpenseAccount: defaultExpense,
      payableAccount: '2100',
      inputVatAccount: '2300',
      approvedSuppliers: vendors.map((v) => ({ name: v.name, partyId: v.id })),
      approvedCategories: expenses.map((a) => ({ label: a.name, accountCode: a.code })),
      policyVersion: defaultPolicy().policyVersion,
      effectiveDate: '2026-01-01',
    };
  });
}

class PostgresStore implements AgentBridgeStore {
  private run<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return scoped(tenantId, fn);
  }
  async flags(tenantId: string) {
    return this.run(tenantId, () => loadAgentBridgeFlags(tenantId));
  }
  async setFlags(tenantId: string, flags: FeatureFlags) {
    await saveAgentBridgeFlags(tenantId, flags);
  }
  async getDocument(tenantId: string, id: string) {
    return this.run(tenantId, async () => {
      const [row] = await db()
        .select()
        .from(agentBridgeDocuments)
        .where(and(eq(agentBridgeDocuments.tenantId, tenantId), eq(agentBridgeDocuments.id, id)))
        .limit(1);
      return row ? mapDoc(row) : null;
    });
  }
  async listDocuments(tenantId: string) {
    return this.run(tenantId, async () => {
      const rows = await db()
        .select()
        .from(agentBridgeDocuments)
        .where(eq(agentBridgeDocuments.tenantId, tenantId));
      return rows.map(mapDoc);
    });
  }
  async findByHash(tenantId: string, hash: string) {
    return this.run(tenantId, async () => {
      const [row] = await db()
        .select()
        .from(agentBridgeDocuments)
        .where(and(eq(agentBridgeDocuments.tenantId, tenantId), eq(agentBridgeDocuments.contentHash, hash)))
        .limit(1);
      return row ? mapDoc(row) : null;
    });
  }
  async saveDocument(d: StoredDocument) {
    return this.run(d.tenantId, async () => {
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
    });
  }
  async getProposal(tenantId: string, id: string) {
    return this.run(tenantId, async () => {
      const [row] = await db()
        .select()
        .from(agentBridgeProposals)
        .where(and(eq(agentBridgeProposals.tenantId, tenantId), eq(agentBridgeProposals.id, id)))
        .limit(1);
      return row ? mapProposal(row) : null;
    });
  }
  async saveProposal(p: StoredProposal) {
    return this.run(p.tenantId, async () => {
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
    });
  }
  async getApproval(tenantId: string, id: string) {
    return this.run(tenantId, async () => {
      const [row] = await db()
        .select()
        .from(agentBridgeApprovals)
        .where(and(eq(agentBridgeApprovals.tenantId, tenantId), eq(agentBridgeApprovals.id, id)))
        .limit(1);
      return row ? mapApproval(row) : null;
    });
  }
  async findApprovalForProposal(tenantId: string, proposalId: string) {
    return this.run(tenantId, async () => {
      const rows = await db()
        .select()
        .from(agentBridgeApprovals)
        .where(and(eq(agentBridgeApprovals.tenantId, tenantId), eq(agentBridgeApprovals.proposalId, proposalId)));
      const hit = rows.find((r) => !r.revokedAt);
      return hit ? mapApproval(hit) : null;
    });
  }
  async saveApproval(a: ApprovalRecord) {
    return this.run(a.tenantId, async () => {
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
    });
  }
  async getOperation(tenantId: string, id: string) {
    return this.run(tenantId, async () => {
      const [row] = await db()
        .select()
        .from(agentBridgeOperations)
        .where(and(eq(agentBridgeOperations.tenantId, tenantId), eq(agentBridgeOperations.id, id)))
        .limit(1);
      return row ? mapOp(row) : null;
    });
  }
  async getOperationByKey(tenantId: string, key: string) {
    return this.run(tenantId, async () => {
      const [row] = await db()
        .select()
        .from(agentBridgeOperations)
        .where(and(eq(agentBridgeOperations.tenantId, tenantId), eq(agentBridgeOperations.idempotencyKey, key)))
        .limit(1);
      return row ? mapOp(row) : null;
    });
  }
  async findOperationForProposal(tenantId: string, proposalId: string) {
    return this.run(tenantId, async () => {
      const [row] = await db()
        .select()
        .from(agentBridgeOperations)
        .where(and(eq(agentBridgeOperations.tenantId, tenantId), eq(agentBridgeOperations.proposalId, proposalId)))
        .limit(1);
      return row ? mapOp(row) : null;
    });
  }
  async saveOperation(op: StoredOperation) {
    return this.run(op.tenantId, async () => {
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
    });
  }
  async claimCommit(op: StoredOperation) {
    return this.run(op.tenantId, async () => {
      const active = await db()
        .select()
        .from(agentBridgeOperations)
        .where(and(eq(agentBridgeOperations.tenantId, op.tenantId), eq(agentBridgeOperations.proposalId, op.proposalId)));
      const existingActive = active.map(mapOp).find((row) => isActiveOperationStatus(row.receipt.status));
      if (existingActive) return { claimed: false as const, existing: existingActive };
      const byKey = await this.getOperationByKey(op.tenantId, op.idempotencyKey);
      if (byKey) return { claimed: false as const, existing: byKey };
      try {
        await db().insert(agentBridgeOperations).values({
          id: op.id,
          tenantId: op.tenantId,
          idempotencyKey: op.idempotencyKey,
          payloadHash: op.payloadHash,
          proposalId: op.proposalId,
          approvalId: op.approvalId,
          receiptJson: op.receipt,
        });
        return { claimed: true as const };
      } catch {
        const again =
          (await this.findOperationForProposal(op.tenantId, op.proposalId)) ||
          (await this.getOperationByKey(op.tenantId, op.idempotencyKey));
        if (again) return { claimed: false as const, existing: again };
        throw new Error('AgentBridge operation claim failed.');
      }
    });
  }
  async revokeApprovalsForProposal(tenantId: string, proposalId: string, nowIso: string) {
    return this.run(tenantId, async () => {
      await db()
        .update(agentBridgeApprovals)
        .set({ revokedAt: new Date(nowIso) })
        .where(and(eq(agentBridgeApprovals.tenantId, tenantId), eq(agentBridgeApprovals.proposalId, proposalId)));
    });
  }
  async saveJob(job: StoredJob) {
    return this.run(job.tenantId, async () => {
      const values = {
        tenantId: job.tenantId,
        documentId: job.documentId,
        status: job.status,
        attempts: job.attempts,
        lastError: job.lastError ?? null,
        updatedAt: new Date(job.updatedAt),
      };
      const existing = await this.getJob(job.tenantId, job.id);
      if (existing) {
        await db().update(agentBridgeJobs).set(values).where(eq(agentBridgeJobs.id, job.id));
      } else {
        await db().insert(agentBridgeJobs).values({ id: job.id, createdAt: new Date(job.createdAt), ...values });
      }
    });
  }
  async getJob(tenantId: string, id: string) {
    return this.run(tenantId, async () => {
      const [row] = await db()
        .select()
        .from(agentBridgeJobs)
        .where(and(eq(agentBridgeJobs.tenantId, tenantId), eq(agentBridgeJobs.id, id)))
        .limit(1);
      return row ? mapJob(row) : null;
    });
  }
  async listJobs(tenantId: string) {
    return this.run(tenantId, async () => {
      const rows = await db().select().from(agentBridgeJobs).where(eq(agentBridgeJobs.tenantId, tenantId));
      return rows.map(mapJob);
    });
  }
  async putBlob(blob: { key: string; tenantId: string; bytes: Uint8Array; mime: string; filename: string }) {
    return this.run(blob.tenantId, async () => {
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
    });
  }
  async getBlob(tenantId: string, key: string) {
    return this.run(tenantId, async () => {
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
    });
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

function mapOp(row: typeof agentBridgeOperations.$inferSelect): StoredOperation {
  return {
    id: row.id,
    tenantId: row.tenantId,
    idempotencyKey: row.idempotencyKey,
    payloadHash: row.payloadHash,
    proposalId: row.proposalId,
    approvalId: row.approvalId ?? undefined,
    receipt: row.receiptJson as OperationReceipt,
  };
}

function mapJob(row: typeof agentBridgeJobs.$inferSelect): StoredJob {
  return {
    id: row.id,
    tenantId: row.tenantId,
    documentId: row.documentId,
    status: row.status as StoredJob['status'],
    attempts: row.attempts,
    lastError: row.lastError ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
      return scoped(input.actor.tenantId, async () => {
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
      });
    },
    async lookupByIdempotencyKey(tenantId, key) {
      return scoped(tenantId, async () => {
        const [row] = await db()
          .select({ resultJson: opsIdempotency.resultJson })
          .from(opsIdempotency)
          .where(and(eq(opsIdempotency.tenantId, tenantId), eq(opsIdempotency.key, key)))
          .limit(1);
        if (!row?.resultJson) return null;
        try {
          const parsed = JSON.parse(row.resultJson) as { ok?: boolean; id?: string; pending?: boolean };
          if (!parsed?.id || parsed.pending) return null;
          return { billId: parsed.id, documentNumber: parsed.id.slice(0, 8).toUpperCase() };
        } catch {
          return null;
        }
      });
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

export async function authorizeAgentConnection(actor: Actor): Promise<Actor> {
  return scoped(actor.tenantId, async () => {
    const [membership] = await db()
      .select({ status: tenantMemberships.status, voidedAt: tenantMemberships.voidedAt })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, actor.tenantId), eq(tenantMemberships.userId, actor.userId)))
      .limit(1);
    if (!membership || membership.status !== 'active' || membership.voidedAt) {
      throw Object.assign(new Error('Membership is not active in this company.'), { code: 'PERMISSION_DENIED' });
    }
    if (actor.connectionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor.connectionId)) {
      const [connection] = await db()
        .select()
        .from(agentBridgeConnections)
        .where(
          and(
            eq(agentBridgeConnections.tenantId, actor.tenantId),
            eq(agentBridgeConnections.id, actor.connectionId),
          ),
        )
        .limit(1);
      if (connection?.revokedAt) {
        throw Object.assign(new Error('AgentBridge connection was revoked.'), { code: 'CONNECTION_REVOKED' });
      }
    }
    const access = await getMyAccess().catch(() => null);
    if (access) {
      const keys: string[] = [];
      if (access.allows('purchase.inbox.read', 'read')) keys.push('purchase.inbox.read');
      if (access.allows('purchase.inbox.write', 'write')) keys.push('purchase.inbox.write');
      if (access.allows('agent_bridge.approve', 'write')) keys.push('agent_bridge.approve');
      if (access.allows('agent_bridge.post', 'write')) keys.push('agent_bridge.post');
      if (access.allows('purchase.bills.write', 'write')) keys.push('purchase.bills.write');
      const live = parseScopes(keys);
      return { ...actor, capabilities: live.length ? live : actor.capabilities };
    }
    return actor;
  });
}

export async function getAgentBridgeServiceForActor(actor: Actor): Promise<AgentBridgeService> {
  await authorizeAgentConnection(actor);
  return withTenantContext(actor.tenantId, async () => makeAgentBridgeService());
}

export { memory as agentBridgeMemoryStore };
