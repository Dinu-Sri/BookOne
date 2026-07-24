/** Write src/catalog/buckets.json from buckets.ts for web UI / Docker. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mod = await import(pathToFileURL(join(root, 'src/buckets.ts')).href);
const out = {
  buckets: mod.E2E_BUCKETS,
  presets: Object.entries(mod.E2E_PRESETS).map(([id, p]) => ({ id, ...p })),
};
const dir = join(root, 'src/catalog');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'buckets.json'), JSON.stringify(out, null, 2) + '\n');
console.log('Wrote', join(dir, 'buckets.json'), out.buckets.length, 'buckets');
