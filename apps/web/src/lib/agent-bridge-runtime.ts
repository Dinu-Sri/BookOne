import {
  AgentBridgeService,
  MemoryStore,
  defaultPolicy,
  extractorFor,
  intersectCapabilities,
  tenantIdFromBoundToken,
  type Actor,
  type AgentBridgeStore,
  type Capability,
  type CompanyPolicy,
  type FeatureFlags,
  type OperationReceipt,
  type PostingPort,
  parseScopes,
} from '@bookone/agent-bridge';
import { loadAccessForUser, requireTenantContext } from '@bookone/auth';
import {
  accounts,
  agentBridgeApprovals,
  agentBridgeBatches,
  agentBridgeBlobs,
  agentBridgeConnections,
  agentBridgeDocuments,
  agentBridgeFactsKeys,
  agentBridgeJobs,
  agentBridgeOauthCodes,
  agentBridgeOperations,
  agentBridgeProposals,
  agentBridgeSettings,
  agentBridgeUploadSessions,
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
  type StoredBatch,
  type StoredConnection,
  type StoredDocument,
  type StoredFactsKey,
  type StoredJob,
  type StoredProposal,
  type StoredOperation,
  type StoredUploadSession,
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
      lastErrorCode: d.lastErrorCode ?? null,
      lastErrorMessage: d.lastErrorMessage ?? null,
      intakeMode: d.intakeMode ?? null,
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
  async casDocument(d: StoredDocument, expectedRevision: number) {
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
        lastErrorCode: d.lastErrorCode ?? null,
        lastErrorMessage: d.lastErrorMessage ?? null,
        intakeMode: d.intakeMode ?? null,
        updatedAt: new Date(),
      };
      const updated = await db()
        .update(agentBridgeDocuments)
        .set(values)
        .where(
          and(
            eq(agentBridgeDocuments.id, d.id),
            eq(agentBridgeDocuments.tenantId, d.tenantId),
            eq(agentBridgeDocuments.proposalRevision, expectedRevision),
          ),
        )
        .returning({ id: agentBridgeDocuments.id });
      return updated.length === 1;
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
  async saveUploadSession(session: StoredUploadSession) {
    return this.run(session.tenantId, async () => {
      const values = {
        tenantId: session.tenantId,
        userId: session.userId,
        connectionId: session.connectionId ?? null,
        filename: session.filename,
        mime: session.mime,
        declaredBytes: session.declaredBytes ?? null,
        expectedHash: session.expectedHash ?? null,
        requestKey: session.requestKey ?? null,
        content: session.bytes ? Buffer.from(session.bytes).toString('base64') : null,
        expiresAt: new Date(session.expiresAt),
        finalizedDocumentId: session.finalizedDocumentId ?? null,
      };
      const existing = await this.getUploadSession(session.tenantId, session.id);
      if (existing) {
        await db().update(agentBridgeUploadSessions).set(values).where(eq(agentBridgeUploadSessions.id, session.id));
      } else {
        await db()
          .insert(agentBridgeUploadSessions)
          .values({ id: session.id, createdAt: new Date(session.createdAt), ...values });
      }
    });
  }
  async getUploadSession(tenantId: string, id: string) {
    return this.run(tenantId, async () => {
      const [row] = await db()
        .select()
        .from(agentBridgeUploadSessions)
        .where(and(eq(agentBridgeUploadSessions.tenantId, tenantId), eq(agentBridgeUploadSessions.id, id)))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        tenantId: row.tenantId,
        userId: row.userId,
        connectionId: row.connectionId ?? undefined,
        filename: row.filename,
        mime: row.mime,
        declaredBytes: row.declaredBytes ?? undefined,
        expectedHash: row.expectedHash ?? undefined,
        requestKey: row.requestKey ?? undefined,
        bytes: row.content ? new Uint8Array(Buffer.from(row.content, 'base64')) : undefined,
        expiresAt: row.expiresAt.toISOString(),
        finalizedDocumentId: row.finalizedDocumentId ?? undefined,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
  async saveBatch(batch: StoredBatch) {
    return this.run(batch.tenantId, async () => {
      const values = {
        tenantId: batch.tenantId,
        userId: batch.userId,
        itemsJson: batch.items,
        updatedAt: new Date(batch.updatedAt),
      };
      const existing = await this.getBatch(batch.tenantId, batch.id);
      if (existing) {
        await db().update(agentBridgeBatches).set(values).where(eq(agentBridgeBatches.id, batch.id));
      } else {
        await db().insert(agentBridgeBatches).values({ id: batch.id, createdAt: new Date(batch.createdAt), ...values });
      }
    });
  }
  async getBatch(tenantId: string, id: string) {
    return this.run(tenantId, async () => {
      const [row] = await db()
        .select()
        .from(agentBridgeBatches)
        .where(and(eq(agentBridgeBatches.tenantId, tenantId), eq(agentBridgeBatches.id, id)))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        tenantId: row.tenantId,
        userId: row.userId,
        items: row.itemsJson as StoredBatch['items'],
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }
  async findBatchItemByKey(tenantId: string, requestKey: string) {
    const rows = await this.run(tenantId, async () =>
      db().select().from(agentBridgeBatches).where(eq(agentBridgeBatches.tenantId, tenantId)),
    );
    for (const row of rows) {
      const batch: StoredBatch = {
        id: row.id,
        tenantId: row.tenantId,
        userId: row.userId,
        items: row.itemsJson as StoredBatch['items'],
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
      const item = batch.items.find((i) => i.requestKey === requestKey);
      if (item) return { batch, item };
    }
    return null;
  }
  async saveFactsKey(row: StoredFactsKey) {
    return this.run(row.tenantId, async () => {
      const existing = await this.getFactsKey(row.tenantId, row.key);
      if (existing) return;
      await db()
        .insert(agentBridgeFactsKeys)
        .values({
          tenantId: row.tenantId,
          key: row.key,
          payloadHash: row.payloadHash,
          documentId: row.documentId,
        })
        .onConflictDoNothing();
    });
  }
  async claimFactsKey(row: StoredFactsKey) {
    return this.run(row.tenantId, async () => {
      const inserted = await db()
        .insert(agentBridgeFactsKeys)
        .values({
          tenantId: row.tenantId,
          key: row.key,
          payloadHash: row.payloadHash,
          documentId: row.documentId,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted.length) return { claimed: true as const };
      const existing = await this.getFactsKey(row.tenantId, row.key);
      if (!existing) return { claimed: true as const };
      return { claimed: false as const, existing };
    });
  }
  async getFactsKey(tenantId: string, key: string) {
    return this.run(tenantId, async () => {
      const [row] = await db()
        .select()
        .from(agentBridgeFactsKeys)
        .where(and(eq(agentBridgeFactsKeys.tenantId, tenantId), eq(agentBridgeFactsKeys.key, key)))
        .limit(1);
      return row ?? null;
    });
  }
  async listConnections(tenantId: string, userId?: string) {
    return this.run(tenantId, async () => {
      const rows = await db()
        .select()
        .from(agentBridgeConnections)
        .where(eq(agentBridgeConnections.tenantId, tenantId));
      return rows
        .filter((r) => !userId || r.userId === userId)
        .map(
          (r): StoredConnection => ({
            id: r.id,
            tenantId: r.tenantId,
            userId: r.userId,
            clientId: r.clientId,
            scopes: (r.scopes || 'read,upload,draft').split(',').filter(Boolean) as StoredConnection['scopes'],
            label: r.label ?? undefined,
            lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : undefined,
            revokedAt: r.revokedAt ? r.revokedAt.toISOString() : undefined,
            createdAt: r.createdAt.toISOString(),
          }),
        );
    });
  }
  async saveConnection(row: StoredConnection) {
    return this.run(row.tenantId, async () => {
      const values = {
        tenantId: row.tenantId,
        userId: row.userId,
        clientId: row.clientId,
        scopes: row.scopes.join(','),
        label: row.label ?? null,
        lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt) : null,
        revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
      };
      const existing = await this.getConnection(row.tenantId, row.id);
      if (existing) {
        await db().update(agentBridgeConnections).set(values).where(eq(agentBridgeConnections.id, row.id));
      } else {
        await db()
          .insert(agentBridgeConnections)
          .values({ id: row.id, createdAt: new Date(row.createdAt), ...values });
      }
    });
  }
  async getConnection(tenantId: string, id: string) {
    return this.run(tenantId, async () => {
      const [row] = await db()
        .select()
        .from(agentBridgeConnections)
        .where(and(eq(agentBridgeConnections.tenantId, tenantId), eq(agentBridgeConnections.id, id)))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        tenantId: row.tenantId,
        userId: row.userId,
        clientId: row.clientId,
        scopes: (row.scopes || 'read,upload,draft').split(',').filter(Boolean) as StoredConnection['scopes'],
        label: row.label ?? undefined,
        lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : undefined,
        revokedAt: row.revokedAt ? row.revokedAt.toISOString() : undefined,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}

export async function saveOauthCode(row: {
  code: string;
  tenantId: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scopes: string;
  connectionId?: string;
  expiresAt: Date;
}) {
  await withTenantContext(row.tenantId, async () => {
    await db().insert(agentBridgeOauthCodes).values(row);
  });
}

export async function takeOauthCode(code: string, tenantHint?: string) {
  const tenantId = tenantHint?.trim() || tenantIdFromBoundToken(code);
  if (!tenantId) return null;
  return withTenantContext(tenantId, async () => {
    const [row] = await db()
      .select()
      .from(agentBridgeOauthCodes)
      .where(and(eq(agentBridgeOauthCodes.tenantId, tenantId), eq(agentBridgeOauthCodes.code, code)))
      .limit(1);
    if (!row || row.usedAt) return null;
    await db()
      .update(agentBridgeOauthCodes)
      .set({ usedAt: new Date() })
      .where(eq(agentBridgeOauthCodes.code, code));
    return row;
  });
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
    lastErrorCode: row.lastErrorCode ?? undefined,
    lastErrorMessage: row.lastErrorMessage ?? undefined,
    intakeMode: (row.intakeMode as StoredDocument['intakeMode']) ?? undefined,
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
        const authorized = await authorizeAgentConnection(input.actor);
        if (!authorized.capabilities.includes('post')) {
          throw Object.assign(new Error('Missing capability post.'), { code: 'PERMISSION_DENIED' });
        }
        const user = await sessionUserForActor(authorized);
        if (user.tenantId !== authorized.tenantId) {
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
    authorizeActor: authorizeAgentConnection,
    publicBaseUrl: process.env.AGENT_BRIDGE_PUBLIC_URL || process.env.AUTH_URL,
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
      if (!connection) {
        throw Object.assign(new Error('AgentBridge connection was not found.'), { code: 'CONNECTION_REVOKED' });
      }
      if (connection.revokedAt) {
        throw Object.assign(new Error('AgentBridge connection was revoked.'), { code: 'CONNECTION_REVOKED' });
      }
      if (connection.userId !== actor.userId) {
        throw Object.assign(new Error('AgentBridge connection belongs to another user.'), { code: 'PERMISSION_DENIED' });
      }
      await db()
        .update(agentBridgeConnections)
        .set({ lastUsedAt: new Date() })
        .where(eq(agentBridgeConnections.id, connection.id));
    }
    const access = await loadAccessForUser(actor.userId, actor.tenantId, 'user');
    if (!access) {
      throw Object.assign(new Error('Current grants could not be loaded for this actor.'), { code: 'PERMISSION_DENIED' });
    }
    const keys: string[] = [];
    if (access.allows('purchase.inbox.read', 'read')) keys.push('purchase.inbox.read');
    if (access.allows('purchase.inbox.write', 'write')) keys.push('purchase.inbox.write');
    if (access.allows('agent_bridge.approve', 'write')) keys.push('agent_bridge.approve');
    if (access.allows('agent_bridge.post', 'write')) keys.push('agent_bridge.post');
    if (access.allows('purchase.bills.write', 'write')) keys.push('purchase.bills.write');
    const live = parseScopes(keys);
    return { ...actor, capabilities: intersectCapabilities(actor.capabilities, live) };
  });
}

export async function getAgentBridgeServiceForActor(actor: Actor): Promise<AgentBridgeService> {
  await authorizeAgentConnection(actor);
  return withTenantContext(actor.tenantId, async () => makeAgentBridgeService());
}

export async function listAgentBridgeConnections(tenantId: string, userId: string) {
  const store = process.env.AGENT_BRIDGE_STORE === 'memory' ? memory : new PostgresStore();
  if (!store.listConnections) return [];
  return store.listConnections(tenantId, userId);
}

export async function revokeAgentBridgeConnection(tenantId: string, userId: string, connectionId: string) {
  const store = process.env.AGENT_BRIDGE_STORE === 'memory' ? memory : new PostgresStore();
  if (!store.getConnection || !store.saveConnection) {
    throw new Error('Connections are not available on this store.');
  }
  const row = await store.getConnection(tenantId, connectionId);
  if (!row || row.userId !== userId) {
    throw Object.assign(new Error('Connection was not found.'), { code: 'CONNECTION_REVOKED' });
  }
  row.revokedAt = new Date().toISOString();
  await store.saveConnection(row);
  return row;
}

export async function recordAgentBridgeConnection(row: StoredConnection) {
  const store = process.env.AGENT_BRIDGE_STORE === 'memory' ? memory : new PostgresStore();
  if (!store.saveConnection) throw new Error('Connections are not available on this store.');
  await store.saveConnection(row);
}

export { memory as agentBridgeMemoryStore };
