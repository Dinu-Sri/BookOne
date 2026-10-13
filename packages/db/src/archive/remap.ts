import { randomUUID } from 'node:crypto';
import {
  ARCHIVE_FORMAT,
  ARCHIVE_SCHEMA_VERSION,
  type ArchiveKind,
  type ArchiveManifest,
} from './format';
import { sha256Hex } from './crypto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_IN_STRING =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const USER_FK_KEYS = new Set([
  'userId',
  'createdBy',
  'openedBy',
  'closedBy',
  'preparedBy',
  'reconciledBy',
  'confirmedBy',
  'attachedBy',
  'overlapOverriddenBy',
]);

export type ArchiveEnvelope = {
  format: string;
  kind: ArchiveKind | string;
  manifest: ArchiveManifest;
  tables: Record<string, Record<string, unknown>[]>;
  objects: unknown[];
};

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function parseArchiveEnvelope(json: string): ArchiveEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That backup file is damaged or incomplete.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('That backup file is damaged or incomplete.');
  }
  const row = parsed as Record<string, unknown>;
  const manifest = row.manifest;
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('That backup file is damaged or incomplete.');
  }
  const tables =
    row.tables && typeof row.tables === 'object' && !Array.isArray(row.tables)
      ? (row.tables as Record<string, Record<string, unknown>[]>)
      : {};
  return {
    format: String(row.format ?? ''),
    kind: String(row.kind ?? '') as ArchiveKind,
    manifest: manifest as ArchiveManifest,
    tables,
    objects: Array.isArray(row.objects) ? row.objects : [],
  };
}

export function validateDataEnvelope(envelope: ArchiveEnvelope): void {
  if (envelope.format !== ARCHIVE_FORMAT) {
    throw new Error('That backup file is not a BookOne archive.');
  }
  if (envelope.kind !== 'data') {
    throw new Error('Upload the company data file (.bookone-data), not the attachments pack.');
  }
  const m = envelope.manifest;
  if (m.format !== ARCHIVE_FORMAT) {
    throw new Error('That backup file is not a BookOne archive.');
  }
  if (typeof m.schemaVersion !== 'number' || m.schemaVersion < 1) {
    throw new Error('That backup file is not a BookOne archive.');
  }
  if (m.schemaVersion > ARCHIVE_SCHEMA_VERSION) {
    throw new Error('This backup needs a newer BookOne.');
  }
  if (m.schemaVersion < ARCHIVE_SCHEMA_VERSION) {
    throw new Error('This backup needs BookOne from an older schema window that is no longer loaded.');
  }
  if (!isUuid(m.exportId) || !isUuid(m.sourceTenantId)) {
    throw new Error('That backup file is damaged or incomplete.');
  }
  const actual = sha256Hex(JSON.stringify(envelope.tables));
  if (actual !== m.dataSha256) {
    throw new Error('That backup file is damaged or incomplete.');
  }
}

function collectUserIds(tables: Record<string, Record<string, unknown>[]>): Set<string> {
  const ids = new Set<string>();
  const take = (value: unknown) => {
    if (isUuid(value)) ids.add(value);
  };
  for (const rows of Object.values(tables)) {
    for (const row of rows ?? []) {
      for (const key of USER_FK_KEYS) take(row[key]);
    }
  }
  return ids;
}

export function pickOwnerMembership(
  memberships: Record<string, unknown>[],
): Record<string, unknown> | null {
  const alive = memberships.filter((row) => row.voidedAt == null);
  const owner =
    alive.find((row) => String(row.role ?? '').toLowerCase() === 'owner') ?? alive[0] ?? null;
  return owner;
}

export function dropExtraUserRows(
  tables: Record<string, Record<string, unknown>[]>,
): Record<string, Record<string, unknown>[]> {
  const memberships = tables.tenant_memberships ?? [];
  const owner = pickOwnerMembership(memberships);
  const ownerMembershipId = owner && isUuid(owner.id) ? owner.id : null;
  const ownerUserId = owner && isUuid(owner.userId) ? owner.userId : null;

  const next: Record<string, Record<string, unknown>[]> = { ...tables };
  next.tenant_memberships = owner ? [owner] : [];
  next.tenant_membership_roles = (tables.tenant_membership_roles ?? []).filter(
    (row) => ownerMembershipId != null && row.membershipId === ownerMembershipId,
  );
  next.tenant_membership_scopes = (tables.tenant_membership_scopes ?? []).filter(
    (row) => ownerMembershipId != null && row.membershipId === ownerMembershipId,
  );
  next.tenant_team_members = (tables.tenant_team_members ?? []).filter(
    (row) => ownerUserId != null && row.userId === ownerUserId,
  );
  next.tenant_permission_overrides = (tables.tenant_permission_overrides ?? []).filter(
    (row) => ownerUserId != null && row.userId === ownerUserId,
  );
  return next;
}

function remapString(value: string, map: Map<string, string>): string {
  return value.replace(UUID_IN_STRING, (match) => {
    const existing = map.get(match);
    if (existing) return existing;
    const next = randomUUID();
    map.set(match, next);
    return next;
  });
}

function remapValue(value: unknown, map: Map<string, string>): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return remapString(value, map);
  if (Array.isArray(value)) return value.map((item) => remapValue(item, map));
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if (typeof rec.$binary === 'string') return value;
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(rec)) {
      out[key] = remapValue(inner, map);
    }
    return out;
  }
  return value;
}

export function remapArchiveTables(args: {
  tables: Record<string, Record<string, unknown>[]>;
  sourceTenantId: string;
  targetTenantId: string;
  restorerUserId: string;
}): {
  tables: Record<string, Record<string, unknown>[]>;
  uuidMap: Map<string, string>;
} {
  const filtered = dropExtraUserRows(args.tables);
  const map = new Map<string, string>();
  map.set(args.sourceTenantId, args.targetTenantId);
  map.set(args.restorerUserId, args.restorerUserId);
  for (const userId of collectUserIds(filtered)) {
    map.set(userId, args.restorerUserId);
  }

  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const [name, rows] of Object.entries(filtered)) {
    tables[name] = (rows ?? []).map((row) => remapValue(row, map) as Record<string, unknown>);
  }

  if (!tables.tenant_memberships?.length) {
    const ownerRole = (tables.tenant_roles ?? []).find(
      (row) => String(row.slug ?? '').toLowerCase() === 'owner',
    );
    tables.tenant_memberships = [
      {
        id: randomUUID(),
        tenantId: args.targetTenantId,
        userId: args.restorerUserId,
        role: 'owner',
        primaryRoleId: ownerRole && isUuid(ownerRole.id) ? ownerRole.id : null,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        voidedAt: null,
      },
    ];
  }

  return { tables, uuidMap: map };
}

export function journalsAreBalanced(
  tables: Record<string, Record<string, unknown>[]>,
): { ok: true } | { ok: false; error: string } {
  const lines = tables.journal_lines ?? [];
  const entries = tables.journal_entries ?? [];
  const byEntry = new Map<string, { debit: number; credit: number }>();
  for (const line of lines) {
    const entryId = String(line.journalEntryId ?? '');
    const side = String(line.side ?? '');
    const amount = Number(line.amount ?? 0);
    if (!entryId || !Number.isFinite(amount)) {
      return { ok: false, error: 'This backup failed integrity checks (journals not balanced).' };
    }
    const slot = byEntry.get(entryId) ?? { debit: 0, credit: 0 };
    if (side === 'debit') slot.debit += amount;
    else if (side === 'credit') slot.credit += amount;
    else return { ok: false, error: 'This backup failed integrity checks (journals not balanced).' };
    byEntry.set(entryId, slot);
  }
  for (const entry of entries) {
    const id = String(entry.id ?? '');
    const slot = byEntry.get(id) ?? { debit: 0, credit: 0 };
    if (Math.abs(slot.debit - slot.credit) > 0.009) {
      return { ok: false, error: 'This backup failed integrity checks (journals not balanced).' };
    }
  }
  for (const [entryId] of byEntry) {
    if (!entries.some((entry) => entry.id === entryId)) {
      return { ok: false, error: 'This backup failed integrity checks (journals not balanced).' };
    }
  }
  return { ok: true };
}

export function trialBalanceHashFromTables(
  tables: Record<string, Record<string, unknown>[]>,
): string {
  const accountsById = new Map<string, string>();
  for (const row of tables.accounts ?? []) {
    if (row.voidedAt != null) continue;
    if (isUuid(row.id) && typeof row.code === 'string') accountsById.set(row.id, row.code);
  }
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const line of tables.journal_lines ?? []) {
    if (line.voidedAt != null) continue;
    const code = isUuid(line.accountId) ? accountsById.get(line.accountId) : undefined;
    if (!code) continue;
    const slot = totals.get(code) ?? { debit: 0, credit: 0 };
    const amount = Number(line.amount ?? 0);
    if (String(line.side) === 'debit') slot.debit += amount;
    else slot.credit += amount;
    totals.set(code, slot);
  }
  const lines = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, slot]) => `${code}|${slot.debit.toFixed(2)}|${slot.credit.toFixed(2)}`);
  return sha256Hex(lines.join('\n'));
}
