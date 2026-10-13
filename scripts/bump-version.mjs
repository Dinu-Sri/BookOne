#!/usr/bin/env node
/**
 * Bump repo-root VERSION (MAJOR.MINOR.PATCH).
 * Usage: node scripts/bump-version.mjs patch|minor|major
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const part = (process.argv[2] || 'patch').toLowerCase();
if (!['patch', 'minor', 'major'].includes(part)) {
  console.error('Usage: node scripts/bump-version.mjs patch|minor|major');
  process.exit(1);
}

const file = join(process.cwd(), 'VERSION');
const cur = readFileSync(file, 'utf8').trim();
const m = cur.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!m) {
  console.error(`VERSION must be MAJOR.MINOR.PATCH, got: ${cur}`);
  process.exit(1);
}
let major = Number(m[1]);
let minor = Number(m[2]);
let patch = Number(m[3]);
if (part === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
} else if (part === 'minor') {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}
const next = `${major}.${minor}.${patch}`;
writeFileSync(file, `${next}\n`);
console.log(`${cur} -> ${next}`);
