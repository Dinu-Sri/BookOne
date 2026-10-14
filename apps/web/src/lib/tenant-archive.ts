import 'server-only';

import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { requireTenantContext, type SessionUser } from '@bookone/auth';
import {
  archiveObjectPrefix,
  auditLog,
  buildArchiveEnvelope,
  collectLiveStoragePointers,
  collectStoragePointers,
  db,
  desc,
  encryptArchivePayload,
  eq,
  and,
  isArchiveObjectKey,
  sha256Hex,
  restoreTenantDataArchive,
  restoreTenantFilesArchive,
  loadLastDataRestore,
  filesRestoreAlreadyApplied,
  snapshotTenantTables,
  tenantIsOperationallyEmpty,
  tenants,
  trialBalanceHash,
  withTenantContext,
  ARCHIVE_EXPORT_NOTES,
  ARCHIVE_FORMAT,
  ARCHIVE_REMINDER_DAYS,
  ARCHIVE_SCHEMA_VERSION,
  MAX_FILES_UPLOAD_BYTES,
  type ArchiveManifest,
  type ArchiveObjectStore,
} from '@bookone/db';
import { bookoneAppVersion, bookoneBuildId } from '@/lib/build-id';
import { isOwnedTenantStorageKey } from '@/lib/storage-key';
import { assertPermission } from '@/lib/access';
import type { PreparedArchiveMeta } from '@/lib/tenant-archive-types';

export type { PreparedArchiveMeta } from '@/lib/tenant-archive-types';

const RATE_LIMIT_MS = 2 * 60 * 1000;
const MEMORY_TTL_MS = 15 * 60 * 1000;
const MAX_OBJECT_BYTES = 32 * 1024 * 1024;
const MAX_PACK_BYTES = 250 * 1024 * 1024;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const FILE_CHUNK_BYTES = 4 * 1024 * 1024;
const CHUNK_TTL_MS = 30 * 60 * 1000;

type StoredPair = {
  meta: PreparedArchiveMeta;
  data: Buffer;
  files: Buffer;
  expiresAt: number;
};

const memoryByTenant = new Map<string, StoredPair>();

function s3Configured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_ACCESS_KEY &&
      process.env.S3_SECRET_KEY &&
      process.env.S3_BUCKET,
  );
}

function s3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  });
}

function isS3MissingKey(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const rec = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return (
    rec.name === 'NoSuchKey' ||
    rec.Code === 'NoSuchKey' ||
    rec.name === 'NotFound' ||
    rec.$metadata?.httpStatusCode === 404
  );
}

/** List-before-get so a missing object never throws NoSuchKey during RSC render. */
async function s3KeyExists(key: string): Promise<boolean> {
  if (!s3Configured()) return false;
  try {
    const res = await s3Client().send(
      new ListObjectsV2Command({
        Bucket: process.env.S3_BUCKET!,
        Prefix: key,
        MaxKeys: 1,
      }),
    );
    return (res.Contents ?? []).some((obj) => obj.Key === key);
  } catch {
    return false;
  }
}

export function isPrimaryCompanyOwner(user: Pick<SessionUser, 'jobSlug' | 'role'>): boolean {
  return (user.jobSlug || user.role || '').toLowerCase() === 'owner';
}

export async function requireArchiveOwner(): Promise<SessionUser> {
  const user = await requireTenantContext();
  if (!isPrimaryCompanyOwner(user)) {
    throw new Error('You do not have permission to do that.');
  }
  await assertPermission('company.backup.write', 'write');
  return user;
}

export function validateArchivePassword(password: string, confirm: string): string | null {
  if (password !== confirm) return 'Password and confirmation do not match.';
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return 'That password is too long.';
  return null;
}

function safeSlug(slug: string): string {
  const cleaned = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 60) || 'company';
}

function stampDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

async function listTenantObjectKeys(tenantId: string): Promise<string[]> {
  if (!s3Configured()) return [];
  try {
    const client = s3Client();
    const bucket = process.env.S3_BUCKET!;
    const prefix = `tenants/${tenantId}/`;
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of res.Contents ?? []) {
        if (!obj.Key) continue;
        if (isArchiveObjectKey(tenantId, obj.Key)) continue;
        if (!isOwnedTenantStorageKey(tenantId, obj.Key)) continue;
        keys.push(obj.Key);
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  } catch (error) {
    if (!isS3MissingKey(error)) {
      console.error('listTenantObjectKeys failed');
    }
    return [];
  }
}

async function getObjectBytes(
  key: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (!s3Configured()) return null;
  try {
    const res = await s3Client().send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
    );
    const bytes = res.Body ? Buffer.from(await res.Body.transformToByteArray()) : Buffer.alloc(0);
    if (bytes.length > MAX_OBJECT_BYTES) return null;
    return { body: bytes, contentType: res.ContentType || 'application/octet-stream' };
  } catch {
    return null;
  }
}

async function putStored(tenantId: string, pair: StoredPair): Promise<void> {
  memoryByTenant.set(tenantId, pair);
  if (!s3Configured()) return;
  const client = s3Client();
  const bucket = process.env.S3_BUCKET!;
  const base = `${archiveObjectPrefix(tenantId)}${pair.meta.exportId}`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${base}/data.bookone-data`,
      Body: pair.data,
      ContentType: 'application/octet-stream',
    }),
  );
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${base}/files.bookone-files`,
      Body: pair.files,
      ContentType: 'application/octet-stream',
    }),
  );
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${archiveObjectPrefix(tenantId)}latest.json`,
      Body: Buffer.from(JSON.stringify(pair.meta), 'utf8'),
      ContentType: 'application/json',
    }),
  );
}

async function readStored(tenantId: string): Promise<StoredPair | null> {
  const mem = memoryByTenant.get(tenantId);
  if (mem && mem.expiresAt > Date.now()) return mem;
  if (mem) memoryByTenant.delete(tenantId);
  if (!s3Configured()) return null;
  try {
    const client = s3Client();
    const bucket = process.env.S3_BUCKET!;
    const latestKey = `${archiveObjectPrefix(tenantId)}latest.json`;
    if (!(await s3KeyExists(latestKey))) return null;
    const latest = await client.send(new GetObjectCommand({ Bucket: bucket, Key: latestKey }));
    const raw = latest.Body ? await latest.Body.transformToString() : '';
    const meta = JSON.parse(raw) as PreparedArchiveMeta;
    if (!meta?.exportId) return null;
    const createdMs = Date.parse(meta.createdAt);
    if (!Number.isFinite(createdMs) || Date.now() - createdMs > MEMORY_TTL_MS) return null;
    const base = `${archiveObjectPrefix(tenantId)}${meta.exportId}`;
    const dataKey = `${base}/data.bookone-data`;
    const filesKey = `${base}/files.bookone-files`;
    if (!(await s3KeyExists(dataKey)) || !(await s3KeyExists(filesKey))) return null;
    const [dataObj, filesObj] = await Promise.all([
      client.send(new GetObjectCommand({ Bucket: bucket, Key: dataKey })),
      client.send(new GetObjectCommand({ Bucket: bucket, Key: filesKey })),
    ]);
    const data = Buffer.from(await dataObj.Body!.transformToByteArray());
    const files = Buffer.from(await filesObj.Body!.transformToByteArray());
    const pair: StoredPair = {
      meta,
      data,
      files,
      expiresAt: createdMs + MEMORY_TTL_MS,
    };
    memoryByTenant.set(tenantId, pair);
    return pair;
  } catch (error) {
    if (!isS3MissingKey(error)) {
      console.error('readStored archive pair failed');
    }
    return null;
  }
}

export async function getArchiveEmptyState(tenantId: string) {
  return tenantIsOperationallyEmpty(tenantId);
}

export async function prepareTenantArchive(password: string, confirm: string): Promise<
  { ok: true; meta: PreparedArchiveMeta } | { ok: false; error: string }
> {
  try {
    const user = await requireArchiveOwner();
    const pwdError = validateArchivePassword(password, confirm);
    if (pwdError) return { ok: false, error: pwdError };

    return await withTenantContext(user.tenantId, async () => {
      const existing = await readStored(user.tenantId);
      if (existing && Date.now() - Date.parse(existing.meta.createdAt) < RATE_LIMIT_MS) {
        return { ok: false, error: 'Wait a couple of minutes before creating another backup.' };
      }

      const exportId = randomUUID();
      const exportedAt = new Date();
      const [tenant] = await db()
        .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.id, user.tenantId))
        .limit(1);
      if (!tenant) return { ok: false, error: 'Company not found.' };

      const emptyState = await tenantIsOperationallyEmpty(user.tenantId);
      const snapshot = await snapshotTenantTables(user.tenantId);
      const tbHash = await trialBalanceHash(user.tenantId);

      const listed = await listTenantObjectKeys(user.tenantId);
      const pointed = collectStoragePointers(snapshot.tables).filter((key) =>
        isOwnedTenantStorageKey(user.tenantId, key),
      );
      const keySet = new Set([...listed, ...pointed]);
      const objects: Array<{
        key: string;
        contentType: string;
        sha256: string;
        size: number;
        bodyBase64: string;
      }> = [];
      let packBytes = 0;
      let missingCount = 0;
      for (const key of keySet) {
        const got = await getObjectBytes(key);
        if (!got) {
          missingCount += 1;
          continue;
        }
        packBytes += got.body.length;
        if (packBytes > MAX_PACK_BYTES) {
          return {
            ok: false,
            error: 'Attachments are too large to pack in one download (over 250 MB).',
          };
        }
        objects.push({
          key,
          contentType: got.contentType,
          sha256: sha256Hex(got.body),
          size: got.body.length,
          bodyBase64: got.body.toString('base64'),
        });
      }

      const dataSha256 = sha256Hex(JSON.stringify(snapshot.tables));
      const filesSha256 = sha256Hex(
        JSON.stringify(objects.map((o) => ({ key: o.key, sha256: o.sha256, size: o.size }))),
      );

      const baseManifest: Omit<ArchiveManifest, 'kind'> = {
        format: ARCHIVE_FORMAT,
        exportId,
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
        appVersion: bookoneAppVersion(),
        appCommit: bookoneBuildId(),
        exportedAt: exportedAt.toISOString(),
        sourceTenantId: user.tenantId,
        sourceName: tenant.name,
        sourceSlug: tenant.slug,
        dataSha256,
        filesSha256,
        fileCount: objects.length,
        rowCounts: snapshot.rowCounts,
        integrity: { trialBalanceHash: tbHash },
      };

      const dataManifest: ArchiveManifest = { ...baseManifest, kind: 'data' };
      const filesManifest: ArchiveManifest = { ...baseManifest, kind: 'files' };

      const dataPlain = buildArchiveEnvelope({
        kind: 'data',
        manifest: dataManifest,
        tables: snapshot.tables,
      });
      const filesPlain = buildArchiveEnvelope({
        kind: 'files',
        manifest: filesManifest,
        objects,
      });

      const dataEnc = encryptArchivePayload(dataPlain, password);
      const filesEnc = encryptArchivePayload(filesPlain, password);
      const stamp = stampDate(exportedAt);
      const slug = safeSlug(tenant.slug);
      const meta: PreparedArchiveMeta = {
        exportId,
        createdAt: exportedAt.toISOString(),
        dataFileName: `${slug}-${stamp}.bookone-data`,
        filesFileName: `${slug}-${stamp}.bookone-files`,
        dataBytes: dataEnc.length,
        filesBytes: filesEnc.length,
        fileCount: objects.length,
        missingCount,
        rowCounts: snapshot.rowCounts,
        empty: emptyState.empty,
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
      };

      await putStored(user.tenantId, {
        meta,
        data: dataEnc,
        files: filesEnc,
        expiresAt: Date.now() + MEMORY_TTL_MS,
      });

      await db().insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'EXPORT',
        tableName: 'tenant.archive',
        recordId: exportId,
        newValues: {
          exportId,
          schemaVersion: ARCHIVE_SCHEMA_VERSION,
          fileCount: objects.length,
          dataSha256,
          filesSha256,
          dataBytes: dataEnc.length,
          filesBytes: filesEnc.length,
        },
        notes: ARCHIVE_EXPORT_NOTES,
      });

      return { ok: true, meta };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create the backup.';
    return { ok: false, error: message };
  }
}

export async function loadPreparedArchive(
  kind: 'data' | 'files',
): Promise<{ buffer: Buffer; fileName: string } | { error: string }> {
  try {
    const user = await requireArchiveOwner();
    const pair = await readStored(user.tenantId);
    if (!pair) return { error: 'Create a backup first, then download the two files.' };
    if (kind === 'data') return { buffer: pair.data, fileName: pair.meta.dataFileName };
    return { buffer: pair.files, fileName: pair.meta.filesFileName };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Download failed.' };
  }
}

export async function peekPreparedArchive(): Promise<PreparedArchiveMeta | null> {
  try {
    const user = await requireArchiveOwner();
    const pair = await readStored(user.tenantId);
    return pair?.meta ?? null;
  } catch {
    return null;
  }
}

export async function restoreTenantArchiveFromUpload(
  file: Buffer,
  password: string,
): Promise<{ ok: true; exportId: string; rowCount: number } | { ok: false; error: string }> {
  try {
    const user = await requireArchiveOwner();
    return await withTenantContext(user.tenantId, () =>
      restoreTenantDataArchive({
        tenantId: user.tenantId,
        restorerUserId: user.id,
        file,
        password,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not restore this backup.';
    return { ok: false, error: message };
  }
}

function s3ObjectStore(): ArchiveObjectStore {
  const client = s3Client();
  const bucket = process.env.S3_BUCKET!;
  return {
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
  };
}

export async function restoreTenantFilesArchiveFromUpload(
  file: Buffer,
  password: string,
): Promise<
  | { ok: true; exportId: string; applied: number; skippedExisting: number; skippedInvalid: number }
  | { ok: false; error: string }
> {
  try {
    const user = await requireArchiveOwner();
    if (!s3Configured()) {
      return { ok: false, error: 'Attachments storage is not configured.' };
    }
    return await withTenantContext(user.tenantId, () =>
      restoreTenantFilesArchive({
        tenantId: user.tenantId,
        restorerUserId: user.id,
        file,
        password,
        store: s3ObjectStore(),
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not restore this backup.';
    return { ok: false, error: message };
  }
}

type FilesUploadSession = {
  id: string;
  tenantId: string;
  userId: string;
  totalBytes: number;
  chunkCount: number;
  received: Set<number>;
  createdAt: number;
};

const filesUploads = new Map<string, FilesUploadSession>();

function pruneFilesUploads() {
  const now = Date.now();
  for (const [id, session] of filesUploads) {
    if (now - session.createdAt > CHUNK_TTL_MS) filesUploads.delete(id);
  }
}

function chunkObjectKey(tenantId: string, sessionId: string, index: number): string {
  return `${archiveObjectPrefix(tenantId)}restore-upload/${sessionId}/${index}`;
}

export async function initFilesRestoreUpload(
  totalBytes: number,
  chunkCount: number,
): Promise<{ ok: true; sessionId: string; chunkCount: number } | { ok: false; error: string }> {
  try {
    const user = await requireArchiveOwner();
    if (!s3Configured()) return { ok: false, error: 'Attachments storage is not configured.' };
    if (!Number.isFinite(totalBytes) || totalBytes <= 0 || totalBytes > MAX_FILES_UPLOAD_BYTES) {
      return { ok: false, error: 'That attachments pack is too large to restore.' };
    }
    const expected = Math.ceil(totalBytes / FILE_CHUNK_BYTES);
    if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 128 || chunkCount !== expected) {
      return { ok: false, error: 'That attachments pack is damaged or incomplete.' };
    }
    pruneFilesUploads();
    const id = randomUUID();
    filesUploads.set(id, {
      id,
      tenantId: user.tenantId,
      userId: user.id,
      totalBytes,
      chunkCount,
      received: new Set(),
      createdAt: Date.now(),
    });
    return { ok: true, sessionId: id, chunkCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not restore this backup.';
    return { ok: false, error: message };
  }
}

export async function putFilesRestoreChunk(
  sessionId: string,
  index: number,
  chunk: Buffer,
): Promise<{ ok: true; received: number; chunkCount: number } | { ok: false; error: string }> {
  try {
    const user = await requireArchiveOwner();
    if (!s3Configured()) return { ok: false, error: 'Attachments storage is not configured.' };
    const session = filesUploads.get(sessionId);
    if (!session || session.tenantId !== user.tenantId || session.userId !== user.id) {
      return { ok: false, error: 'That upload session expired. Start again.' };
    }
    if (Date.now() - session.createdAt > CHUNK_TTL_MS) {
      filesUploads.delete(sessionId);
      return { ok: false, error: 'That upload session expired. Start again.' };
    }
    if (!Number.isInteger(index) || index < 0 || index >= session.chunkCount) {
      return { ok: false, error: 'That attachments pack is damaged or incomplete.' };
    }
    if (!chunk.length || chunk.length > FILE_CHUNK_BYTES + 64 * 1024) {
      return { ok: false, error: 'That attachments pack is damaged or incomplete.' };
    }
    await s3Client().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: chunkObjectKey(user.tenantId, sessionId, index),
        Body: chunk,
        ContentType: 'application/octet-stream',
      }),
    );
    session.received.add(index);
    return { ok: true, received: session.received.size, chunkCount: session.chunkCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not restore this backup.';
    return { ok: false, error: message };
  }
}

async function deleteUploadChunks(tenantId: string, sessionId: string, chunkCount: number) {
  if (!s3Configured()) return;
  const client = s3Client();
  const bucket = process.env.S3_BUCKET!;
  for (let i = 0; i < chunkCount; i++) {
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: chunkObjectKey(tenantId, sessionId, i) }),
      );
    } catch {
      /* best-effort */
    }
  }
}

export async function commitFilesRestoreUpload(
  sessionId: string,
  password: string,
): Promise<
  | { ok: true; exportId: string; applied: number; skippedExisting: number; skippedInvalid: number }
  | { ok: false; error: string }
> {
  try {
    const user = await requireArchiveOwner();
    if (!s3Configured()) return { ok: false, error: 'Attachments storage is not configured.' };
    const session = filesUploads.get(sessionId);
    if (!session || session.tenantId !== user.tenantId || session.userId !== user.id) {
      return { ok: false, error: 'That upload session expired. Start again.' };
    }
    if (session.received.size !== session.chunkCount) {
      return { ok: false, error: 'That attachments pack is damaged or incomplete.' };
    }
    const client = s3Client();
    const bucket = process.env.S3_BUCKET!;
    const parts: Buffer[] = [];
    for (let i = 0; i < session.chunkCount; i++) {
      const obj = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: chunkObjectKey(user.tenantId, sessionId, i) }),
      );
      parts.push(Buffer.from(await obj.Body!.transformToByteArray()));
    }
    const file = Buffer.concat(parts);
    filesUploads.delete(sessionId);
    const result = await restoreTenantFilesArchiveFromUpload(file, password);
    await deleteUploadChunks(user.tenantId, sessionId, session.chunkCount);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not restore this backup.';
    return { ok: false, error: message };
  }
}

export type ArchiveBackupStatus = {
  lastExportAt: string | null;
  lastRestoreExportId: string | null;
  lastRestoreAt: string | null;
  filesApplied: boolean;
  missingAttachmentCount: number;
  reminderNeeded: boolean;
  reminderDays: number;
};

const EMPTY_BACKUP_STATUS: ArchiveBackupStatus = {
  lastExportAt: null,
  lastRestoreExportId: null,
  lastRestoreAt: null,
  filesApplied: false,
  missingAttachmentCount: 0,
  reminderNeeded: true,
  reminderDays: ARCHIVE_REMINDER_DAYS,
};

export async function getArchiveBackupStatus(tenantId: string): Promise<ArchiveBackupStatus> {
  try {
    const [exportRow] = await db()
      .select({ createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, tenantId), eq(auditLog.notes, ARCHIVE_EXPORT_NOTES)))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);
    const lastRestore = await loadLastDataRestore(tenantId);
    const filesApplied = lastRestore
      ? await filesRestoreAlreadyApplied(tenantId, lastRestore.exportId)
      : false;
    let missingAttachmentCount = 0;
    try {
      const pointers = await collectLiveStoragePointers(tenantId);
      const listed = new Set(s3Configured() ? await listTenantObjectKeys(tenantId) : []);
      for (const key of pointers) {
        if (!isOwnedTenantStorageKey(tenantId, key)) continue;
        if (!listed.has(key)) missingAttachmentCount += 1;
      }
    } catch (error) {
      if (!isS3MissingKey(error)) {
        console.error('archive missing-attachment count failed');
      }
      missingAttachmentCount = 0;
    }
    const lastExportAt = exportRow?.createdAt ? new Date(exportRow.createdAt).toISOString() : null;
    const ageMs = lastExportAt ? Date.now() - Date.parse(lastExportAt) : Number.POSITIVE_INFINITY;
    const reminderNeeded = !Number.isFinite(ageMs)
      ? true
      : ageMs > ARCHIVE_REMINDER_DAYS * 24 * 60 * 60 * 1000;
    return {
      lastExportAt,
      lastRestoreExportId: lastRestore?.exportId ?? null,
      lastRestoreAt: lastRestore?.createdAt ? new Date(lastRestore.createdAt).toISOString() : null,
      filesApplied,
      missingAttachmentCount,
      reminderNeeded,
      reminderDays: ARCHIVE_REMINDER_DAYS,
    };
  } catch (error) {
    if (!isS3MissingKey(error)) {
      console.error('getArchiveBackupStatus failed');
    }
    return EMPTY_BACKUP_STATUS;
  }
}
