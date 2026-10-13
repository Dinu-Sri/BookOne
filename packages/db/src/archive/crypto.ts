import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash, timingSafeEqual } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { ARCHIVE_MAGIC } from './format';

const SALT_LEN = 16;
const IV_LEN = 12;
const KEY_LEN = 32;
const TAG_LEN = 16;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function deriveArchiveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN, SCRYPT);
}

/** gzip JSON then AES-256-GCM. Password is never stored. */
export function encryptArchivePayload(plaintextJson: string, password: string): Buffer {
  const gz = gzipSync(Buffer.from(plaintextJson, 'utf8'));
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveArchiveKey(password, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(gz), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ARCHIVE_MAGIC, salt, iv, ciphertext, tag]);
}

export function decryptArchivePayload(file: Buffer, password: string): string {
  if (file.length < ARCHIVE_MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN) {
    throw new Error('That backup file is not a BookOne archive.');
  }
  const magic = file.subarray(0, ARCHIVE_MAGIC.length);
  if (magic.length !== ARCHIVE_MAGIC.length || !timingSafeEqual(magic, ARCHIVE_MAGIC)) {
    throw new Error('That backup file is not a BookOne archive.');
  }
  const salt = file.subarray(ARCHIVE_MAGIC.length, ARCHIVE_MAGIC.length + SALT_LEN);
  const ivStart = ARCHIVE_MAGIC.length + SALT_LEN;
  const iv = file.subarray(ivStart, ivStart + IV_LEN);
  const tag = file.subarray(file.length - TAG_LEN);
  const ciphertext = file.subarray(ivStart + IV_LEN, file.length - TAG_LEN);
  const key = deriveArchiveKey(password, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const gz = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return gunzipSync(gz).toString('utf8');
}
