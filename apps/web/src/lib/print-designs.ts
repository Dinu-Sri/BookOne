import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  businessDocuments,
  db,
  desc,
  documentStyles,
  eq,
  isNull,
  printDesignAssets,
  printDesigns,
  sql,
  taxProfiles,
  withTenantContext,
} from '@bookone/db';
import {
  PRINT_KINDS,
  PRINT_KIND_INFO,
  defaultDesignInput,
  designGuide,
  isPrintKind,
  validateDesign,
  type AssetSlot,
  type PrintDesign,
  type PrintKind,
} from '@bookone/print-design';

export type DesignStatus = 'draft' | 'awaiting_approval' | 'approved' | 'retired';

export type DesignVersionRow = {
  id: string;
  kind: PrintKind;
  familyId: string;
  name: string;
  version: number;
  status: DesignStatus;
  inUse: boolean;
  createdVia: 'person' | 'assistant' | 'system';
  agentLabel: string | null;
  changeNote: string | null;
  createdAt: string;
  approvalRequestedAt: string | null;
  approvedAt: string | null;
  basedOnId: string | null;
};

export type DesignResult =
  | {
      ok: true;
      designId: string;
      familyId: string;
      version: number;
      status: DesignStatus;
      warnings: string[];
      missingAssets: AssetSlot[];
      previewUrl: string;
      nextStep: string;
    }
  | { ok: false; code: string; error: string; problems?: Array<{ where: string; problem: string }> };

const ASSET_SLOTS: AssetSlot[] = ['logo', 'signature', 'stamp'];

function rowOut(r: typeof printDesigns.$inferSelect): DesignVersionRow {
  return {
    id: r.id,
    kind: r.kind as PrintKind,
    familyId: r.familyId,
    name: r.name,
    version: r.version,
    status: r.status as DesignStatus,
    inUse: r.inUse === '1',
    createdVia: (r.createdVia as DesignVersionRow['createdVia']) || 'person',
    agentLabel: r.agentLabel,
    changeNote: r.changeNote,
    createdAt: r.createdAt.toISOString(),
    approvalRequestedAt: r.approvalRequestedAt?.toISOString() ?? null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    basedOnId: r.basedOnId,
  };
}

export function designPath(id: string) {
  return `/company/print-designs/${id}`;
}

function absolute(path: string) {
  const base = (process.env.AGENT_BRIDGE_PUBLIC_URL || process.env.AUTH_URL || '').replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

/** Which images are uploaded. The logo falls back to the active document style logo. */
export async function assetKeys(tenantId: string): Promise<Record<AssetSlot, string | null>> {
  const rows = await db()
    .select({ slot: printDesignAssets.slot, imageKey: printDesignAssets.imageKey })
    .from(printDesignAssets)
    .where(and(eq(printDesignAssets.tenantId, tenantId), isNull(printDesignAssets.voidedAt)))
    .orderBy(desc(printDesignAssets.createdAt));
  const out: Record<AssetSlot, string | null> = { logo: null, signature: null, stamp: null };
  for (const r of rows) {
    const slot = r.slot as AssetSlot;
    if (ASSET_SLOTS.includes(slot) && !out[slot]) out[slot] = r.imageKey;
  }
  if (!out.logo) {
    const [style] = await db()
      .select({ logoImageKey: documentStyles.logoImageKey })
      .from(documentStyles)
      .where(
        and(
          eq(documentStyles.tenantId, tenantId),
          eq(documentStyles.isActive, '1'),
          isNull(documentStyles.voidedAt),
          isNull(documentStyles.brandId),
          sql`${documentStyles.logoImageKey} is not null`,
        ),
      )
      .orderBy(desc(documentStyles.updatedAt))
      .limit(1);
    out.logo = style?.logoImageKey ?? null;
  }
  return out;
}

export async function assetUrls(tenantId: string): Promise<Record<AssetSlot, string | null>> {
  const keys = await assetKeys(tenantId);
  const { resolveProductImageUrl } = await import('@/lib/product-image');
  return {
    logo: keys.logo ? await resolveProductImageUrl(keys.logo, tenantId) : null,
    signature: keys.signature ? await resolveProductImageUrl(keys.signature, tenantId) : null,
    stamp: keys.stamp ? await resolveProductImageUrl(keys.stamp, tenantId) : null,
  };
}

function hasAssets(keys: Record<AssetSlot, string | null>) {
  return { logo: !!keys.logo, signature: !!keys.signature, stamp: !!keys.stamp };
}

export async function listVersions(tenantId: string, kind?: PrintKind): Promise<DesignVersionRow[]> {
  return withTenantContext(tenantId, async () => {
    const rows = await db()
      .select()
      .from(printDesigns)
      .where(
        and(
          eq(printDesigns.tenantId, tenantId),
          isNull(printDesigns.deletedAt),
          kind ? eq(printDesigns.kind, kind) : undefined,
        ),
      )
      .orderBy(asc(printDesigns.kind), desc(printDesigns.createdAt));
    return rows.map(rowOut);
  });
}

export async function getVersion(
  tenantId: string,
  id: string,
): Promise<(DesignVersionRow & { design: PrintDesign }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return withTenantContext(tenantId, async () => {
    const [r] = await db()
      .select()
      .from(printDesigns)
      .where(and(eq(printDesigns.tenantId, tenantId), eq(printDesigns.id, id), isNull(printDesigns.deletedAt)))
      .limit(1);
    if (!r || !isPrintKind(r.kind)) return null;
    const res = validateDesign(r.kind, JSON.parse(r.design));
    // Stored designs were valid when saved; if rules tightened since, show the standard design.
    const design = res.ok ? res.design : (validateDesign(r.kind, defaultDesignInput(r.kind)) as { design: PrintDesign }).design;
    return { ...rowOut(r), design };
  });
}

/** The version printed for a kind right now, or null for the BookOne standard print. */
export async function inUseVersion(tenantId: string, kind: PrintKind) {
  const [r] = await db()
    .select()
    .from(printDesigns)
    .where(
      and(
        eq(printDesigns.tenantId, tenantId),
        eq(printDesigns.kind, kind),
        eq(printDesigns.inUse, '1'),
        isNull(printDesigns.deletedAt),
      ),
    )
    .limit(1);
  if (!r) return null;
  const res = validateDesign(kind, JSON.parse(r.design));
  return res.ok ? { id: r.id, name: r.name, version: r.version, design: res.design } : null;
}

/** A specific saved version for printing (also retired ones: documents keep the design they first printed with). */
export async function versionForPrint(tenantId: string, id: string, kind: PrintKind) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await db()
    .select()
    .from(printDesigns)
    .where(and(eq(printDesigns.tenantId, tenantId), eq(printDesigns.id, id), eq(printDesigns.kind, kind)))
    .limit(1);
  if (!r) return null;
  const res = validateDesign(kind, JSON.parse(r.design));
  return res.ok ? { id: r.id, name: r.name, version: r.version, design: res.design } : null;
}

function parseDesignJson(designJson: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(designJson) };
  } catch {
    return { ok: false, error: 'designJson is not valid JSON.' };
  }
}

async function nextVersion(tenantId: string, familyId: string) {
  const [row] = await db()
    .select({ max: sql<number>`coalesce(max(${printDesigns.version}), 0)` })
    .from(printDesigns)
    .where(and(eq(printDesigns.tenantId, tenantId), eq(printDesigns.familyId, familyId)));
  return Number(row?.max ?? 0) + 1;
}

export type Author =
  | { via: 'person'; userId: string }
  | { via: 'assistant'; userId: string; connectionId: string | null; agentLabel: string };

/**
 * Save a design. With basedOnId it becomes the next version of that design's family;
 * without, it starts a new design at version 1. Every save is a new row; nothing is overwritten.
 */
export async function saveDesign(input: {
  tenantId: string;
  author: Author;
  kind?: PrintKind;
  basedOnId?: string;
  name?: string;
  design: unknown;
  changeNote?: string;
}): Promise<DesignResult> {
  return withTenantContext(input.tenantId, async () => {
    let kind = input.kind;
    let familyId: string | null = null;
    let name = (input.name ?? '').trim().slice(0, 120);
    if (input.basedOnId) {
      const [base] = await db()
        .select()
        .from(printDesigns)
        .where(and(eq(printDesigns.tenantId, input.tenantId), eq(printDesigns.id, input.basedOnId), isNull(printDesigns.deletedAt)))
        .limit(1);
      if (!base) return { ok: false, code: 'NOT_FOUND', error: 'That design was not found in this company.' };
      kind = base.kind as PrintKind;
      familyId = base.familyId;
      if (!name) name = base.name;
    }
    if (!kind || !isPrintKind(kind)) return { ok: false, code: 'VALIDATION', error: 'Choose a print item (kind).' };
    if (!name) return { ok: false, code: 'VALIDATION', error: 'Give the design a name.' };
    const keys = await assetKeys(input.tenantId);
    const res = validateDesign(kind, input.design, { assets: hasAssets(keys) });
    if (!res.ok) {
      return {
        ok: false,
        code: 'DESIGN_REFUSED',
        error: `The design was not saved: ${res.errors.length} problem${res.errors.length === 1 ? '' : 's'}. Fix them and save again.`,
        problems: res.errors.map((e) => ({ where: e.path, problem: e.message })),
      };
    }
    const id = randomUUID();
    const fam = familyId ?? id;
    const version = familyId ? await nextVersion(input.tenantId, fam) : 1;
    const note = (input.changeNote ?? '').trim().slice(0, 500) || null;
    await db()
      .insert(printDesigns)
      .values({
        id,
        tenantId: input.tenantId,
        kind,
        familyId: fam,
        name,
        version,
        status: 'draft',
        design: JSON.stringify(res.design),
        changeNote: note,
        createdVia: input.author.via,
        createdByUserId: input.author.userId,
        agentConnectionId: input.author.via === 'assistant' ? input.author.connectionId : null,
        agentLabel: input.author.via === 'assistant' ? input.author.agentLabel.slice(0, 80) : null,
        basedOnId: input.basedOnId ?? null,
      });
    return {
      ok: true,
      designId: id,
      familyId: fam,
      version,
      status: 'draft',
      warnings: res.warnings.map((w) => w.message),
      missingAssets: res.missingAssets,
      previewUrl: absolute(designPath(id)),
      nextStep:
        input.author.via === 'assistant'
          ? 'Saved as a draft. Call request_print_design_approval so a person can review it in BookOne. It is not used for printing until they approve it.'
          : 'Saved as a draft. Approve it to use it for printing.',
    };
  });
}

export async function requestApproval(tenantId: string, id: string, message?: string) {
  return withTenantContext(tenantId, async () => {
    const [r] = await db()
      .select()
      .from(printDesigns)
      .where(and(eq(printDesigns.tenantId, tenantId), eq(printDesigns.id, id), isNull(printDesigns.deletedAt)))
      .limit(1);
    if (!r) return { ok: false as const, code: 'NOT_FOUND', error: 'That design was not found in this company.' };
    if (r.status === 'approved') return { ok: true as const, status: 'approved', note: 'Already approved.' };
    if (r.status === 'retired') return { ok: false as const, code: 'RETIRED', error: 'That version is retired. Save a new version instead.' };
    const note = (message ?? '').trim().slice(0, 500);
    await db()
      .update(printDesigns)
      .set({
        status: 'awaiting_approval',
        approvalRequestedAt: new Date(),
        changeNote: note ? [r.changeNote, note].filter(Boolean).join('\n') : r.changeNote,
        updatedAt: new Date(),
      })
      .where(eq(printDesigns.id, id));
    return {
      ok: true as const,
      status: 'awaiting_approval',
      reviewUrl: absolute(designPath(id)),
      nextStep: 'Tell the user to open the review link, check the preview and press "Approve and use" in BookOne.',
    };
  });
}

/** Person only: approve a version and make it the one printed for its kind. */
export async function approveAndUse(tenantId: string, id: string, userId: string) {
  return withTenantContext(tenantId, async () => {
    const [r] = await db()
      .select()
      .from(printDesigns)
      .where(and(eq(printDesigns.tenantId, tenantId), eq(printDesigns.id, id), isNull(printDesigns.deletedAt)))
      .limit(1);
    if (!r) return { ok: false as const, error: 'That design was not found.' };
    if (!isPrintKind(r.kind) || !validateDesign(r.kind, JSON.parse(r.design)).ok) {
      return { ok: false as const, error: 'This version no longer meets the rules for this print item. Save a corrected version.' };
    }
    const now = new Date();
    await db()
      .update(printDesigns)
      .set({ inUse: '0', inUseUntil: now, updatedAt: now })
      .where(and(eq(printDesigns.tenantId, tenantId), eq(printDesigns.kind, r.kind), eq(printDesigns.inUse, '1')));
    await db()
      .update(printDesigns)
      .set({
        status: 'approved',
        approvedAt: r.approvedAt ?? now,
        approvedByUserId: r.approvedByUserId ?? userId,
        inUse: '1',
        inUseFrom: now,
        inUseUntil: null,
        updatedAt: now,
      })
      .where(eq(printDesigns.id, id));
    return { ok: true as const, kind: r.kind as PrintKind };
  });
}

/** Person only: go back to the BookOne standard print for a kind. The design is kept. */
export async function stopUsing(tenantId: string, kind: PrintKind) {
  return withTenantContext(tenantId, async () => {
    const now = new Date();
    await db()
      .update(printDesigns)
      .set({ inUse: '0', inUseUntil: now, updatedAt: now })
      .where(and(eq(printDesigns.tenantId, tenantId), eq(printDesigns.kind, kind), eq(printDesigns.inUse, '1')));
    return { ok: true as const };
  });
}

/** Person only: delete a version that is not in use. Documents that printed with it keep their copy of the design. */
export async function deleteVersion(tenantId: string, id: string, userId: string) {
  return withTenantContext(tenantId, async () => {
    const [r] = await db()
      .select()
      .from(printDesigns)
      .where(and(eq(printDesigns.tenantId, tenantId), eq(printDesigns.id, id), isNull(printDesigns.deletedAt)))
      .limit(1);
    if (!r) return { ok: false as const, error: 'That design was not found.' };
    if (r.inUse === '1') return { ok: false as const, error: 'This version is in use. Use another design or the BookOne standard first.' };
    await db()
      .update(printDesigns)
      .set({ deletedAt: new Date(), deletedByUserId: userId, inUse: '0', updatedAt: new Date() })
      .where(eq(printDesigns.id, id));
    return { ok: true as const, kind: r.kind as PrintKind };
  });
}

export async function saveAsset(tenantId: string, slot: AssetSlot, imageKey: string, userId: string) {
  return withTenantContext(tenantId, async () => {
    await db()
      .update(printDesignAssets)
      .set({ voidedAt: new Date() })
      .where(and(eq(printDesignAssets.tenantId, tenantId), eq(printDesignAssets.slot, slot), isNull(printDesignAssets.voidedAt)));
    await db().insert(printDesignAssets).values({ tenantId, slot, imageKey, uploadedByUserId: userId });
  });
}

export async function removeAsset(tenantId: string, slot: AssetSlot) {
  return withTenantContext(tenantId, async () => {
    await db()
      .update(printDesignAssets)
      .set({ voidedAt: new Date() })
      .where(and(eq(printDesignAssets.tenantId, tenantId), eq(printDesignAssets.slot, slot), isNull(printDesignAssets.voidedAt)));
  });
}

/** Overview per print item for the home screen and for assistants. */
export async function printItemsOverview(tenantId: string) {
  const versions = await listVersions(tenantId);
  return PRINT_KINDS.map((kind) => {
    const mine = versions.filter((v) => v.kind === kind);
    const inUse = mine.find((v) => v.inUse) ?? null;
    return {
      kind,
      label: PRINT_KIND_INFO[kind].label,
      description: PRINT_KIND_INFO[kind].description,
      inUse: inUse ? { designId: inUse.id, name: inUse.name, version: inUse.version } : null,
      usingStandard: !inUse,
      designs: new Set(mine.map((v) => v.familyId)).size,
      awaitingApproval: mine.filter((v) => v.status === 'awaiting_approval').length,
      drafts: mine.filter((v) => v.status === 'draft').length,
    };
  });
}

/** The assistant-facing port. No delete, approve or use: those stay with a person. */
export function webPrintDesignPort() {
  return {
    async listItems(tenantId: string) {
      const items = await withTenantContext(tenantId, () => printItemsOverview(tenantId));
      return {
        ok: true,
        items,
        note: 'Use get_print_design_guide before designing. A person approves designs in BookOne before they print.',
      };
    },
    async guide(_tenantId: string, kind: string) {
      if (!isPrintKind(kind)) return { ok: false, code: 'VALIDATION', error: 'Unknown print item.' };
      return { ok: true, ...designGuide(kind) };
    },
    async listDesigns(tenantId: string, kind?: string) {
      if (kind && !isPrintKind(kind)) return { ok: false, code: 'VALIDATION', error: 'Unknown print item.' };
      const versions = await listVersions(tenantId, kind as PrintKind | undefined);
      return {
        ok: true,
        designs: versions.map((v) => ({
          designId: v.id,
          kind: v.kind,
          name: v.name,
          version: v.version,
          familyId: v.familyId,
          status: v.status,
          inUse: v.inUse,
          madeBy: v.createdVia === 'assistant' ? v.agentLabel ?? 'Assistant' : v.createdVia === 'system' ? 'BookOne' : 'A person',
          createdAt: v.createdAt,
        })),
      };
    },
    async getDesign(tenantId: string, designId: string) {
      const v = await getVersion(tenantId, designId);
      if (!v) return { ok: false, code: 'NOT_FOUND', error: 'That design was not found in this company.' };
      const keys = await withTenantContext(tenantId, () => assetKeys(tenantId));
      const check = validateDesign(v.kind, v.design, { assets: hasAssets(keys) });
      return {
        ok: true,
        designId: v.id,
        kind: v.kind,
        name: v.name,
        version: v.version,
        status: v.status,
        inUse: v.inUse,
        designJson: JSON.stringify(v.design),
        warnings: check.warnings.map((w) => w.message),
        previewUrl: absolute(designPath(v.id)),
      };
    },
    async assets(tenantId: string) {
      const keys = await withTenantContext(tenantId, () => assetKeys(tenantId));
      return {
        ok: true,
        logo: keys.logo ? 'uploaded' : 'missing',
        signature: keys.signature ? 'uploaded' : 'missing',
        stamp: keys.stamp ? 'uploaded' : 'missing',
        uploadUrl: absolute('/company/print-designs#images'),
        note: keys.logo
          ? 'Logo is uploaded. Use the logo element to place it.'
          : 'No logo is uploaded. Ask the user to upload it at the upload URL (Logo and images) before relying on it.',
      };
    },
    async create(input: {
      tenantId: string;
      userId: string;
      connectionId: string | null;
      agentLabel: string;
      kind: string;
      name: string;
      designJson: string;
      changeNote?: string;
    }) {
      if (!isPrintKind(input.kind)) return { ok: false, code: 'VALIDATION', error: 'Unknown print item.' };
      const parsed = parseDesignJson(input.designJson);
      if (!parsed.ok) return { ok: false, code: 'VALIDATION', error: parsed.error };
      return saveDesign({
        tenantId: input.tenantId,
        author: { via: 'assistant', userId: input.userId, connectionId: input.connectionId, agentLabel: input.agentLabel },
        kind: input.kind,
        name: input.name,
        design: parsed.value,
        changeNote: input.changeNote,
      });
    },
    async saveVersion(input: {
      tenantId: string;
      userId: string;
      connectionId: string | null;
      agentLabel: string;
      basedOnDesignId: string;
      designJson: string;
      changeNote?: string;
      name?: string;
    }) {
      const parsed = parseDesignJson(input.designJson);
      if (!parsed.ok) return { ok: false, code: 'VALIDATION', error: parsed.error };
      if (!/^[0-9a-f-]{36}$/i.test(input.basedOnDesignId)) return { ok: false, code: 'NOT_FOUND', error: 'That design was not found.' };
      return saveDesign({
        tenantId: input.tenantId,
        author: { via: 'assistant', userId: input.userId, connectionId: input.connectionId, agentLabel: input.agentLabel },
        basedOnId: input.basedOnDesignId,
        name: input.name,
        design: parsed.value,
        changeNote: input.changeNote,
      });
    },
    async requestApproval(input: { tenantId: string; userId: string; designId: string; message?: string }) {
      if (!/^[0-9a-f-]{36}$/i.test(input.designId)) return { ok: false, code: 'NOT_FOUND', error: 'That design was not found.' };
      return requestApproval(input.tenantId, input.designId, input.message);
    },
  };
}

/**
 * The design a stored document prints with: the version it printed with before (kept, so
 * reprints match), else the version in use now, remembered on the document per print item.
 * With keepStandard (the document printed earlier with a custom document style) nothing new is chosen.
 */
export async function designForDocument(
  tenantId: string,
  doc: { id: string; printStyleSnapshot?: string | null },
  kind: PrintKind,
  opts: { keepStandard?: boolean } = {},
) {
  let raw = doc.printStyleSnapshot;
  if (raw === undefined) {
    const [row] = await db()
      .select({ printStyleSnapshot: businessDocuments.printStyleSnapshot })
      .from(businessDocuments)
      .where(and(eq(businessDocuments.tenantId, tenantId), eq(businessDocuments.id, doc.id)))
      .limit(1);
    raw = row?.printStyleSnapshot ?? null;
  }
  let snap: Record<string, unknown> | null = null;
  try {
    snap = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    snap = null;
  }
  const remembered = (snap?.printDesigns ?? {}) as Partial<Record<PrintKind, string>>;
  const rememberedId = remembered[kind];
  if (rememberedId) return versionForPrint(tenantId, rememberedId, kind);
  if (opts.keepStandard) return null;
  const chosen = await inUseVersion(tenantId, kind);
  if (chosen) {
    const next = { ...(snap ?? {}), printDesigns: { ...remembered, [kind]: chosen.id } };
    try {
      await db()
        .update(businessDocuments)
        .set({ printStyleSnapshot: JSON.stringify(next), updatedAt: new Date() })
        .where(and(eq(businessDocuments.tenantId, tenantId), eq(businessDocuments.id, doc.id)));
    } catch {
      /* the print still works; it is remembered next time */
    }
  }
  return chosen;
}

export async function companyTin(tenantId: string): Promise<string> {
  const [tax] = await db().select({ tin: taxProfiles.tin }).from(taxProfiles).where(eq(taxProfiles.tenantId, tenantId)).limit(1);
  return tax?.tin ?? '';
}
