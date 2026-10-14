import { sha256Hex } from './crypto';
import {
  ARCHIVE_FORMAT,
  ARCHIVE_SCHEMA_VERSION,
  isArchiveObjectKey,
  rewriteTenantPrefix,
} from './format';
import { isUuid, type ArchiveEnvelope } from './remap';

export type PackedArchiveObject = {
  key: string;
  contentType: string;
  sha256: string;
  size: number;
  bodyBase64: string;
};

export type ArchiveObjectStore = {
  exists: (key: string) => Promise<boolean>;
  put: (key: string, body: Buffer, contentType: string) => Promise<void>;
};

export const MAX_ARCHIVE_OBJECT_BYTES = 32 * 1024 * 1024;
export const MAX_ARCHIVE_PACK_BYTES = 250 * 1024 * 1024;
export const MAX_FILES_UPLOAD_BYTES = 280 * 1024 * 1024;

function hasTraversal(key: string): boolean {
  return key.includes('..') || key.includes('\\') || key.includes('\0') || key.startsWith('/');
}

export function filesManifestChecksum(
  objects: Array<{ key: string; sha256: string; size: number }>,
): string {
  return sha256Hex(JSON.stringify(objects.map((o) => ({ key: o.key, sha256: o.sha256, size: o.size }))));
}

export function parsePackedObjects(raw: unknown[]): PackedArchiveObject[] {
  const out: PackedArchiveObject[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.key !== 'string' || typeof row.bodyBase64 !== 'string') continue;
    out.push({
      key: row.key,
      contentType: typeof row.contentType === 'string' ? row.contentType : 'application/octet-stream',
      sha256: typeof row.sha256 === 'string' ? row.sha256 : '',
      size: Number(row.size ?? 0),
      bodyBase64: row.bodyBase64,
    });
  }
  return out;
}

export function validateFilesEnvelope(envelope: ArchiveEnvelope): void {
  if (envelope.format !== ARCHIVE_FORMAT) {
    throw new Error('That backup file is not a BookOne archive.');
  }
  if (envelope.kind !== 'files') {
    throw new Error('Upload the attachments pack (.bookone-files), not the company data file.');
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
  if (!isUuid(m.exportId) || !isUuid(m.sourceTenantId)) {
    throw new Error('That backup file is damaged or incomplete.');
  }
  const objects = parsePackedObjects(envelope.objects);
  if (typeof m.fileCount === 'number' && m.fileCount !== objects.length) {
    throw new Error('That backup file is damaged or incomplete.');
  }
  const actual = filesManifestChecksum(objects);
  if (actual !== m.filesSha256) {
    throw new Error('That backup file is damaged or incomplete.');
  }
}

export type FilesPackPairing = 'checksum' | 'legacy-export-id';

/**
 * Pair a files pack to the last data restore.
 *
 * Current (v2.5+) data restores persist filesSha256. Those packs must match that
 * checksum (frozen pair contract).
 *
 * Legacy (v2.4.0) data restores omitted filesSha256 on the audit row. Those packs
 * may apply when exportId matches. That pairing is exportId-only and is not
 * cross-checksum proof.
 */
export function assertFilesPackMatchesDataRestore(args: {
  packExportId: string;
  packFilesSha256: string;
  lastRestore: { exportId: string; filesSha256?: string | null } | null;
  filesAlreadyApplied: boolean;
}): FilesPackPairing {
  if (!args.lastRestore) {
    throw new Error('Restore the company data file first, then upload the matching attachments pack.');
  }
  if (args.lastRestore.exportId !== args.packExportId) {
    throw new Error('This attachments pack does not match the restored company data.');
  }
  if (args.filesAlreadyApplied) {
    throw new Error('Attachments for this restore are already applied.');
  }
  const stored = args.lastRestore.filesSha256;
  if (typeof stored === 'string' && stored.length > 0) {
    if (stored !== args.packFilesSha256) {
      throw new Error('This attachments pack does not match the restored company data.');
    }
    return 'checksum';
  }
  return 'legacy-export-id';
}

export function assertFilesApplyComplete(result: {
  skippedInvalid: number;
}): void {
  if (result.skippedInvalid > 0) {
    throw new Error('This attachments pack is incomplete or contains invalid files.');
  }
}

export async function applyArchiveObjects(args: {
  targetTenantId: string;
  sourceTenantId: string;
  objects: PackedArchiveObject[];
  store: ArchiveObjectStore;
}): Promise<{ applied: number; skippedExisting: number; skippedInvalid: number }> {
  let applied = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;
  const prefix = `tenants/${args.targetTenantId}/`;

  for (const obj of args.objects) {
    const nextKey = rewriteTenantPrefix(obj.key, args.sourceTenantId, args.targetTenantId);
    if (
      hasTraversal(nextKey) ||
      !nextKey.startsWith(prefix) ||
      isArchiveObjectKey(args.targetTenantId, nextKey)
    ) {
      skippedInvalid += 1;
      continue;
    }
    let body: Buffer;
    try {
      body = Buffer.from(obj.bodyBase64, 'base64');
    } catch {
      skippedInvalid += 1;
      continue;
    }
    if (!body.length || body.length > MAX_ARCHIVE_OBJECT_BYTES) {
      skippedInvalid += 1;
      continue;
    }
    if (obj.sha256 && sha256Hex(body) !== obj.sha256) {
      skippedInvalid += 1;
      continue;
    }
    if (await args.store.exists(nextKey)) {
      skippedExisting += 1;
      continue;
    }
    await args.store.put(nextKey, body, obj.contentType);
    applied += 1;
  }

  return { applied, skippedExisting, skippedInvalid };
}
