/** Refuse non-disposable database and object-storage targets. */

const TEST_NAME = /(^|[_-])(test|pilot|coreguard|ci)([_-]|$)/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db']);
const REMOTE_BLOCK = /clossyan\.com|amazonaws\.com|r2\.cloudflarestorage\.com|neon\.tech|supabase\.co|azure\.com|rds\.amazonaws/i;

function parseUrl(raw: string, label: string): URL {
  const value = raw.trim();
  if (!value) throw new Error(`REFUSED: ${label} is missing.`);
  try {
    return new URL(value);
  } catch {
    throw new Error(`REFUSED: ${label} is not a URL.`);
  }
}

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, '').split('/')[0] ?? '');
}

export function assertDisposableDatabaseUrl(raw: string): URL {
  const url = parseUrl(raw, 'DATABASE_URL');
  if (!/^postgres(ql)?:$/i.test(url.protocol)) {
    throw new Error('REFUSED: DATABASE_URL must be postgres.');
  }
  const host = url.hostname.toLowerCase();
  const name = databaseName(url);
  if (!name) throw new Error('REFUSED: DATABASE_URL has no database name.');
  if (REMOTE_BLOCK.test(host) || REMOTE_BLOCK.test(raw)) {
    throw new Error(`REFUSED: ${host} is not a disposable CoreGuard database host.`);
  }
  const local = LOCAL_HOSTS.has(host);
  if (!TEST_NAME.test(name)) {
    throw new Error(
      `REFUSED: database "${name}" is not a test/pilot/coreguard/ci target. Create bookone_test instead of using the local bookone database.`,
    );
  }
  if (!local && !TEST_NAME.test(name)) {
    throw new Error(`REFUSED: host ${host} is not local and the database name is not a test target.`);
  }
  return url;
}

export function assertDisposableStorage(input: {
  endpoint?: string | null;
  bucket?: string | null;
}): void {
  const endpoint = input.endpoint?.trim();
  const bucket = input.bucket?.trim();
  if (!endpoint && !bucket) return;
  if (endpoint) {
    const url = parseUrl(endpoint, 'S3_ENDPOINT');
    const host = url.hostname.toLowerCase();
    if (REMOTE_BLOCK.test(host) || REMOTE_BLOCK.test(endpoint)) {
      throw new Error(`REFUSED: S3_ENDPOINT ${host} is not disposable storage.`);
    }
    if (!LOCAL_HOSTS.has(host) && !/minio/i.test(host)) {
      throw new Error(`REFUSED: S3_ENDPOINT ${host} is not local MinIO/test storage.`);
    }
  }
  if (bucket && !TEST_NAME.test(bucket) && bucket !== 'bookone-test') {
    throw new Error(`REFUSED: S3_BUCKET "${bucket}" is not a test bucket.`);
  }
}

export function assertDisposableAppUrl(raw: string | undefined): void {
  if (!raw?.trim()) return;
  const url = parseUrl(raw, 'AUTH_URL');
  const host = url.hostname.toLowerCase();
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`REFUSED: AUTH_URL host ${host} is not local.`);
  }
}

export function assertPilotTargets(env: NodeJS.ProcessEnv = process.env): {
  databaseUrl: string;
  databaseName: string;
} {
  const databaseUrl = env.DATABASE_URL ?? '';
  const parsed = assertDisposableDatabaseUrl(databaseUrl);
  assertDisposableStorage({ endpoint: env.S3_ENDPOINT, bucket: env.S3_BUCKET });
  assertDisposableAppUrl(env.AUTH_URL ?? env.BETTER_AUTH_URL);
  return { databaseUrl, databaseName: databaseName(parsed) };
}
