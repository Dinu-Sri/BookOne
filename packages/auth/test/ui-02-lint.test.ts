import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPROVED_CONTROL_FILES,
  FEATURE_ZERO_PREFIXES,
  SHELL_REQUIRED_FILES,
  countsByFile,
  isFeatureFile,
  scanSource,
  scanTree,
  type UiViolation,
} from './ui-consistency';

const root = path.resolve(__dirname, '../../..');
const baselinePath = path.join(__dirname, 'ui-02-baseline.json');

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function sortedCounts(hits: UiViolation[]): Record<string, Record<string, number>> {
  const raw = countsByFile(hits);
  const files = Object.keys(raw).sort();
  const out: Record<string, Record<string, number>> = {};
  for (const file of files) {
    const rules = Object.keys(raw[file]).sort();
    out[file] = {};
    for (const rule of rules) out[file][rule] = raw[file][rule];
  }
  return out;
}

function growth(current: Record<string, Record<string, number>>, baseline: Record<string, Record<string, number>>) {
  const extra: string[] = [];
  for (const file of Object.keys(current)) {
    for (const rule of Object.keys(current[file])) {
      const now = current[file][rule] ?? 0;
      const was = baseline[file]?.[rule] ?? 0;
      if (now > was) extra.push(`${file} ${rule} ${was} -> ${now}`);
    }
  }
  return extra;
}

describe('UI-02 AST consistency lint', () => {
  it('fails representative native select, date, and unstyled field fixtures', () => {
    const text = read('packages/auth/test/fixtures/ui-02-fail.tsx');
    const hits = scanSource('apps/web/src/components/accounts/ui-02-fail-demo.tsx', text);
    expect(hits.map((h) => h.rule).sort()).toEqual(['raw-date', 'raw-select', 'unstyled-field', 'unstyled-textarea']);
  });

  it('accepts branded .input fields and exempt hidden, checkbox, radio, file, and submit inputs', () => {
    const text = read('packages/auth/test/fixtures/ui-02-pass.tsx');
    const hits = scanSource('apps/web/src/components/accounts/ui-02-pass-demo.tsx', text);
    expect(hits).toEqual([]);
  });

  it('accepts the approved shared control implementations', () => {
    for (const rel of APPROVED_CONTROL_FILES) {
      const hits = scanSource(rel, read(rel));
      expect(hits, rel).toEqual([]);
    }
  });

  it('requires FormBackLink on create, detail, opening, import, and Advances', () => {
    for (const rel of SHELL_REQUIRED_FILES) {
      const hits = scanSource(rel, read(rel)).filter((h) => h.rule === 'form-shell');
      expect(hits, rel).toEqual([]);
    }
  });

  it('keeps Accounts and Advances feature files at zero violations', () => {
    const hits = scanTree(root).filter((h) => isFeatureFile(h.file));
    expect(hits).toEqual([]);
    expect(FEATURE_ZERO_PREFIXES.length).toBeGreaterThan(0);
  });

  it('does not let the legacy violation baseline grow', () => {
    const legacy = scanTree(root).filter((h) => !isFeatureFile(h.file));
    const current = sortedCounts(legacy);
    if (process.env.UI02_WRITE_BASELINE === '1') {
      writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
    }
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Record<string, Record<string, number>>;
    const extra = growth(current, baseline);
    expect(extra).toEqual([]);
  });
});
