import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

export function productVersion(): string {
  return readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
}

export function productSha(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function schemaFingerprint(): string {
  const dir = path.join(ROOT, 'packages/db/migrations');
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  return files.at(-1) ?? 'none';
}

export function fixtureVersion(): string {
  return 'custom-bank.v1';
}
