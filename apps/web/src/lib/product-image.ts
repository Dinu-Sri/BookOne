import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';

const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);

/** Resize/crop to 400×400 WebP (quality ~78). Discards original dimensions/format. */
export async function processProductPhoto(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize(400, 400, { fit: 'cover', position: 'attention' })
    .webp({ quality: 78, effort: 4 })
    .toBuffer();
}

/** Fit inside 1600×1600 WebP — keeps aspect for return inspection evidence. */
export async function processInspectPhoto(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78, effort: 4 })
    .toBuffer();
}

function s3Configured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_ACCESS_KEY &&
      process.env.S3_SECRET_KEY &&
      process.env.S3_BUCKET,
  );
}

function makeS3Client(): S3Client {
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

/**
 * Accepts an uploaded File/Blob, processes to 400×400 WebP, stores to S3 (preferred)
 * or public/uploads/products (fallback). Returns image_key for DB.
 */
export async function saveProductPhoto(opts: {
  tenantId: string;
  productId: string;
  file: File;
}): Promise<{ imageKey: string }> {
  if (!ALLOWED.has(opts.file.type) && opts.file.type !== '') {
    // allow empty type from some browsers if extension looks ok
    const name = opts.file.name.toLowerCase();
    const okExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].some((e) => name.endsWith(e));
    if (!okExt) throw new Error(`Unsupported image type: ${opts.file.type || 'unknown'}`);
  }
  if (opts.file.size > MAX_INPUT_BYTES) {
    throw new Error('Image too large (max 12 MB).');
  }

  const raw = Buffer.from(await opts.file.arrayBuffer());
  const webp = await processProductPhoto(raw);

  if (s3Configured()) {
    const key = `tenants/${opts.tenantId}/products/${opts.productId}-${randomUUID().slice(0, 8)}.webp`;
    const client = makeS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: webp,
        ContentType: 'image/webp',
        ContentLength: webp.length,
        Metadata: {
          tenantId: opts.tenantId,
          productId: opts.productId,
          processed: '400x400-webp',
        },
      }),
    );
    return { imageKey: key };
  }

  // Local/dev fallback: public static file (original discarded after process)
  const relDir = path.join('products', 'uploads', opts.tenantId);
  const publicRoot = path.join(process.cwd(), 'public');
  const absDir = path.join(publicRoot, relDir);
  await mkdir(absDir, { recursive: true });
  const filename = `${opts.productId}-${randomUUID().slice(0, 8)}.webp`;
  await writeFile(path.join(absDir, filename), webp);
  return { imageKey: `/${relDir.replace(/\\/g, '/')}/${filename}` };
}

/** Resolve a stored image_key to a browser-usable URL. */
export async function resolveProductImageUrl(imageKey: string | null | undefined): Promise<string | null> {
  if (!imageKey) return null;
  if (imageKey.startsWith('/') || imageKey.startsWith('http://') || imageKey.startsWith('https://')) {
    return imageKey;
  }
  const publicBase = process.env.S3_PUBLIC_URL?.replace(/\/$/, '');
  if (publicBase) {
    return `${publicBase}/${imageKey}`;
  }
  if (!s3Configured()) return null;
  try {
    const client = makeS3Client();
    const command = new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: imageKey });
    return await getSignedUrl(client, command, { expiresIn: 3600 });
  } catch {
    return null;
  }
}

/** Generate a simple branded 400×400 WebP for demo products. */
export async function generateDemoProductWebp(label: string, bg: string, accent: string): Promise<Buffer> {
  const svg = `
  <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}"/>
        <stop offset="100%" stop-color="${accent}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#g)"/>
    <circle cx="200" cy="150" r="64" fill="rgba(255,255,255,0.18)"/>
    <rect x="80" y="240" width="240" height="88" rx="16" fill="rgba(255,255,255,0.16)"/>
    <text x="200" y="292" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
      font-size="28" font-weight="700" fill="#ffffff">${escapeXml(label.slice(0, 18))}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
}

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function assertImageFile(file: File): void {
  if (!ALLOWED.has(file.type) && file.type !== '') {
    const name = file.name.toLowerCase();
    const okExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'].some((e) => name.endsWith(e));
    if (!okExt) throw new Error(`Unsupported image type: ${file.type || 'unknown'}`);
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Image too large (max 12 MB).');
  }
}

async function storeWebp(opts: {
  tenantId: string;
  relDir: string;
  filename: string;
  s3Key: string;
  webp: Buffer;
  processed: string;
  extraMeta?: Record<string, string>;
}): Promise<{ imageKey: string }> {
  if (s3Configured()) {
    const client = makeS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: opts.s3Key,
        Body: opts.webp,
        ContentType: 'image/webp',
        ContentLength: opts.webp.length,
        Metadata: {
          tenantId: opts.tenantId,
          processed: opts.processed,
          ...opts.extraMeta,
        },
      }),
    );
    return { imageKey: opts.s3Key };
  }

  const publicRoot = path.join(process.cwd(), 'public');
  const absDir = path.join(publicRoot, opts.relDir);
  await mkdir(absDir, { recursive: true });
  await writeFile(path.join(absDir, opts.filename), opts.webp);
  return { imageKey: `/${opts.relDir.replace(/\\/g, '/')}/${opts.filename}` };
}

/**
 * Accepts an uploaded File/Blob, fits inside 1600×1600 WebP (no crop), stores to S3
 * or public/rental-returns. Returns image_key for DB.
 */
export async function saveRentalInspectPhoto(opts: {
  tenantId: string;
  bookingLineId: string;
  file: File;
}): Promise<{ imageKey: string }> {
  assertImageFile(opts.file);
  const raw = Buffer.from(await opts.file.arrayBuffer());
  const webp = await processInspectPhoto(raw);
  const stamp = randomUUID().slice(0, 8);
  const filename = `${opts.bookingLineId}-${stamp}.webp`;
  return storeWebp({
    tenantId: opts.tenantId,
    relDir: path.join('rental-returns', opts.tenantId),
    filename,
    s3Key: `tenants/${opts.tenantId}/rental-returns/${filename}`,
    webp,
    processed: '1600-inside-webp',
    extraMeta: { bookingLineId: opts.bookingLineId },
  });
}
