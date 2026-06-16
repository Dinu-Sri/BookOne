'use server';

import { requireTenantContext } from '@bookone/auth';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export interface UploadResult {
  ok: boolean;
  receiptRef?: string;
  error?: string;
}

export interface PresignedUploadResult {
  ok: boolean;
  uploadUrl?: string;
  key?: string;
  publicUrl?: string;
  error?: string;
}

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function makeClient(): S3Client {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION ?? 'auto';
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('S3 env not configured. Set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET.');
  }
  return new S3Client({
    region,
    endpoint,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    credentials: { accessKeyId, secretAccessKey },
  });
}

function makeKey(tenantId: string, userId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const id = randomUUID();
  return `tenants/${tenantId}/receipts/${userId}/${id}-${safeName}`;
}

/**
 * Uploads a receipt file to S3-compatible storage (R2 / MinIO) under the
 * current tenant namespace and returns the storage key. The key is stored
 * in `transactions.receiptRef`. A presigned GET URL can be obtained via
 * `getReceiptDownloadUrl(key)`.
 */
export async function uploadReceipt(formData: FormData): Promise<UploadResult> {
  try {
    const user = await requireTenantContext();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { ok: false, error: 'No file provided.' };
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return { ok: false, error: `Unsupported file type: ${file.type || 'unknown'}.` };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB).` };
    }

    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      return { ok: false, error: 'S3_BUCKET env not set.' };
    }

    const client = makeClient();
    const key = makeKey(user.tenantId, user.id, file.name || 'receipt');
    const buffer = Buffer.from(await file.arrayBuffer());

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        ContentLength: buffer.length,
        Metadata: {
          tenantId: user.tenantId,
          uploadedBy: user.id,
          originalName: file.name ?? 'receipt',
        },
      }),
    );

    return { ok: true, receiptRef: key };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown upload error';
    console.error('uploadReceipt failed:', message);
    return { ok: false, error: message };
  }
}

/**
 * Returns a 10-minute presigned GET URL for a previously uploaded receipt.
 * Used when rendering receipt thumbnails in the Journal or Transactions page.
 */
export async function getReceiptDownloadUrl(key: string): Promise<string | null> {
  try {
    await requireTenantContext();
    const bucket = process.env.S3_BUCKET;
    if (!bucket) return null;

    const client = makeClient();
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return await getSignedUrl(client, command, { expiresIn: 600 });
  } catch (error) {
    console.error('getReceiptDownloadUrl failed:', error);
    return null;
  }
}
