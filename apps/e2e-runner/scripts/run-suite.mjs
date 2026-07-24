/**
 * Cross-platform suite launcher.
 *   node scripts/run-suite.mjs smoke|p0|core|full [-- extra playwright args]
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const suite = (process.argv[2] || 'core').toLowerCase();
const extra = process.argv.slice(3);
if (extra[0] === '--') extra.shift();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = {
  ...process.env,
  E2E_SUITE: suite,
  ...(suite === 'full' ? { E2E_FULL: '1' } : {}),
};

console.log(`[e2e] E2E_SUITE=${suite}`);

const proc = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['playwright', 'test', '--config', 'playwright.config.ts', ...extra],
  { stdio: 'inherit', env, shell: process.platform === 'win32', cwd: root },
);

proc.on('exit', (code) => process.exit(code ?? 1));
proc.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
