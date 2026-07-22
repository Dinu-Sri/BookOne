/**
 * Parse docs/E2E_SCENARIO_CATALOG.md → apps/e2e-runner/src/catalog/scenarios.json
 * Run: node scripts/export-e2e-catalog.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = join(root, 'docs', 'E2E_SCENARIO_CATALOG.md');
const outDir = join(root, 'apps', 'e2e-runner', 'src', 'catalog');
const outPath = join(outDir, 'scenarios.json');

const text = readFileSync(mdPath, 'utf8');
const lines = text.split(/\r?\n/);

let section = '';
/** @type {Array<{id:string,title:string,section:string,priority:string,tags:string[],steps:string[]}>} */
const scenarios = [];
/** @type {typeof scenarios[0] | null} */
let cur = null;

for (const line of lines) {
  const h = line.match(/^## (.+)/);
  if (h) {
    section = h[1].trim();
    continue;
  }
  const m = line.match(/^### (S-\d{4})\s*[—–-]\s*(.+)/);
  if (m) {
    if (cur) scenarios.push(cur);
    cur = {
      id: m[1],
      title: m[2].trim(),
      section,
      priority: 'P1',
      tags: [],
      steps: [],
    };
    continue;
  }
  if (!cur) continue;

  const p = line.match(/^- \*\*Priority:\*\*\s*(P\d)/);
  if (p) {
    cur.priority = p[1];
    continue;
  }
  const tg = line.match(/^- \*\*Tags:\*\*\s*(.+)/);
  if (tg) {
    const tags = [];
    const re = /`(@[a-z0-9_-]+)`/gi;
    let mm;
    while ((mm = re.exec(tg[1])) !== null) tags.push(mm[1]);
    cur.tags = tags;
    continue;
  }
  const st = line.match(/^\s+\d+\.\s+(.+)/);
  if (st) {
    cur.steps.push(st[1].trim());
  }
}
if (cur) scenarios.push(cur);

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(scenarios, null, 2) + '\n', 'utf8');
console.log(`Exported ${scenarios.length} scenarios → ${outPath}`);
