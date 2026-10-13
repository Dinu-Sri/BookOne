import { eq, getTableColumns, getTableName } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db, pgClient } from '../db';
import { auditLog, tenantInvites, tenants } from '../schema';
import { decryptArchivePayload } from './crypto';
import { tenantIsOperationallyEmpty } from './empty';
import { ARCHIVE_RESTORE_INSERT_ORDER } from './format';
import {
  journalsAreBalanced,
  parseArchiveEnvelope,
  remapArchiveTables,
  validateDataEnvelope,
} from './remap';
import { ARCHIVE_DUMP_TABLES, trialBalanceHash } from './snapshot';

const MAX_DATA_BYTES = 40 * 1024 * 1024;
const ADVISORY_NS = 881002;
const BATCH = 80;

const DEFERRED_FK: Record<string, string[]> = {
  transactions: ['reversesTransactionId', 'reversedByTransactionId'],
  business_documents: ['sourceDocumentId', 'sourcePosSaleId'],
  inventory_product_categories: ['parentId'],
  bank_statement_profiles: ['currentVersionId'],
};

const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function tableByName(): Map<string, PgTable> {
  const map = new Map<string, PgTable>();
  for (const entry of ARCHIVE_DUMP_TABLES) {
    map.set(getTableName(entry.table), entry.table);
  }
  return map;
}

function coerceValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'object' && value && '$binary' in value) {
    const b64 = (value as { $binary?: unknown }).$binary;
    if (typeof b64 === 'string') return Buffer.from(b64, 'base64');
  }
  if (typeof value === 'string' && ISO_TS.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return value;
}

function rowForInsert(table: PgTable, row: Record<string, unknown>): Record<string, unknown> {
  const cols = getTableColumns(table);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(cols)) {
    if (key in row) out[key] = coerceValue(row[key]);
  }
  return out;
}

function friendlyError(error: unknown): string {
  if (!(error instanceof Error)) return 'Could not restore this backup.';
  const msg = error.message;
  if (
    msg.includes('BookOne archive') ||
    msg.includes('backup') ||
    msg.includes('company data file') ||
    msg.includes('newer BookOne') ||
    msg.includes('schema window') ||
    msg.includes('already has records') ||
    msg.includes('already running') ||
    msg.includes('integrity') ||
    msg.includes('chart of accounts')
  ) {
    return msg;
  }
  if (/bad decrypt|unable to authenticate|Unsupported state|invalid password/i.test(msg)) {
    return 'Wrong password or the file is damaged.';
  }
  return 'Could not restore this backup.';
}

export async function restoreTenantDataArchive(args: {
  tenantId: string;
  restorerUserId: string;
  file: Buffer;
  password: string;
}): Promise<{ ok: true; exportId: string; rowCount: number } | { ok: false; error: string }> {
  try {
    if (!args.file?.length) return { ok: false, error: 'Choose a company data file to restore.' };
    if (args.file.length > MAX_DATA_BYTES) {
      return { ok: false, error: 'That data file is too large to restore in one upload.' };
    }
    if (!args.password) return { ok: false, error: 'Password is required.' };

    const json = decryptArchivePayload(args.file, args.password);
    const envelope = parseArchiveEnvelope(json);
    validateDataEnvelope(envelope);

    const { tables } = remapArchiveTables({
      tables: envelope.tables,
      sourceTenantId: envelope.manifest.sourceTenantId,
      targetTenantId: args.tenantId,
      restorerUserId: args.restorerUserId,
    });

    if (!(tables.accounts ?? []).length) {
      return { ok: false, error: 'This backup has no chart of accounts.' };
    }
    const journals = journalsAreBalanced(tables);
    if (!journals.ok) return journals;

    const names = new Set(ARCHIVE_DUMP_TABLES.map((entry) => getTableName(entry.table)));
    const insertNames = ARCHIVE_RESTORE_INSERT_ORDER as readonly string[];
    if (insertNames.length !== names.size - 1 || insertNames.some((name) => !names.has(name))) {
      throw new Error('Archive restore table list is out of date.');
    }

    const byName = tableByName();

    return await db().transaction(async (tx) => {
      const lockRows = await pgClient()<Array<{ locked: boolean | string | number }>>`
        select pg_try_advisory_xact_lock(${ADVISORY_NS}, hashtext(${args.tenantId})) as locked
      `;
      const lockVal = lockRows[0]?.locked;
      const locked = lockVal === true || lockVal === 't' || lockVal === 'true' || lockVal === 1;
      if (!locked) {
        throw new Error('A restore is already running for this company.');
      }

      const emptyState = await tenantIsOperationallyEmpty(args.tenantId);
      if (!emptyState.empty) {
        throw new Error('This company already has records. Create a new company and restore into that.');
      }

      await tx.delete(tenantInvites).where(eq(tenantInvites.tenantId, args.tenantId));

      for (const name of [...insertNames].reverse()) {
        const table = byName.get(name);
        if (!table) continue;
        await tx.delete(table).where(eq((table as typeof auditLog).tenantId, args.tenantId));
      }

      const sourceTenant = (envelope.tables.tenants ?? [])[0] ?? {};
      const tenantPatch: Record<string, unknown> = { updatedAt: new Date() };
      if (typeof sourceTenant.name === 'string' && sourceTenant.name.trim()) {
        tenantPatch.name = sourceTenant.name.trim().slice(0, 255);
      }
      if (typeof sourceTenant.plan === 'string') tenantPatch.plan = sourceTenant.plan;
      if (sourceTenant.modules && typeof sourceTenant.modules === 'object') {
        tenantPatch.modules = sourceTenant.modules;
      }
      if (typeof sourceTenant.entityKind === 'string') tenantPatch.entityKind = sourceTenant.entityKind;
      if ('capabilityTier' in sourceTenant) {
        tenantPatch.capabilityTier =
          typeof sourceTenant.capabilityTier === 'string' ? sourceTenant.capabilityTier : null;
      }
      if (typeof sourceTenant.rbacEnforced === 'boolean') tenantPatch.rbacEnforced = sourceTenant.rbacEnforced;
      await tx.update(tenants).set(tenantPatch as never).where(eq(tenants.id, args.tenantId));

      let rowCount = 0;
      const deferredUpdates: Array<{ table: PgTable; id: string; patch: Record<string, unknown> }> =
        [];

      for (const name of insertNames) {
        const table = byName.get(name);
        const rows = tables[name] ?? [];
        if (!table || !rows.length) continue;
        const deferredKeys = DEFERRED_FK[name] ?? [];
        const prepared = rows.map((row) => {
          const insertRow = rowForInsert(table, row);
          const patch: Record<string, unknown> = {};
          for (const key of deferredKeys) {
            if (insertRow[key] != null) {
              patch[key] = insertRow[key];
              insertRow[key] = null;
            }
          }
          const id = typeof insertRow.id === 'string' ? insertRow.id : '';
          if (id && Object.keys(patch).length) {
            deferredUpdates.push({ table, id, patch });
          }
          return insertRow;
        });

        for (let i = 0; i < prepared.length; i += BATCH) {
          const chunk = prepared.slice(i, i + BATCH);
          await tx.insert(table).values(chunk as never);
          rowCount += chunk.length;
        }
      }

      for (const item of deferredUpdates) {
        await tx
          .update(item.table)
          .set(item.patch as never)
          .where(eq((item.table as typeof auditLog).id, item.id));
      }

      const tbHash = await trialBalanceHash(args.tenantId);
      if (tbHash !== envelope.manifest.integrity.trialBalanceHash) {
        throw new Error('This backup failed integrity checks (trial balance).');
      }

      await tx.insert(auditLog).values({
        tenantId: args.tenantId,
        userId: args.restorerUserId,
        action: 'IMPORT',
        tableName: 'tenant.archive',
        recordId: envelope.manifest.exportId,
        newValues: {
          exportId: envelope.manifest.exportId,
          schemaVersion: envelope.manifest.schemaVersion,
          sourceTenantId: envelope.manifest.sourceTenantId,
          dataSha256: envelope.manifest.dataSha256,
          rowCount,
        },
        notes: 'tenant.archive.restore',
      });

      return { ok: true as const, exportId: envelope.manifest.exportId, rowCount };
    });
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}
