import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// v2.17.3 docker/entrypoint.sh ran `drizzle-kit push --force` on every web start.
// Any table created by SQL migrations but missing from the Drizzle schema is
// treated as extra and dropped. v2.17.3 (drizzle-kit 0.31) dropped all
// Better Auth tables on staging this way. These locks keep every SQL-only
// table excluded by drizzle.config.ts `tablesFilter`.

const dbRoot = path.resolve(__dirname, '../../db');
const configSource = readFileSync(path.join(dbRoot, 'drizzle.config.ts'), 'utf8');

function readAll(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return readAll(full, ext);
    return entry.name.endsWith(ext) ? [readFileSync(full, 'utf8')] : [];
  });
}

function drizzleTables(): Set<string> {
  const names = new Set<string>();
  for (const src of readAll(path.join(dbRoot, 'src/schema'), '.ts')) {
    for (const m of src.matchAll(/pgTable\(\s*['"]([a-z0-9_]+)['"]/g)) names.add(m[1]);
  }
  return names;
}

function sqlTables(): Set<string> {
  const names = new Set<string>();
  for (const src of readAll(path.join(dbRoot, 'migrations'), '.sql')) {
    for (const m of src.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi)) {
      names.add(m[1].toLowerCase());
    }
  }
  return names;
}

function excludedPatterns(): string[] {
  const block = configSource.match(/tablesFilter:\s*\[([^\]]*)\]/);
  if (!block) return [];
  return [...block[1].matchAll(/['"]!([^'"]+)['"]/g)].map((m) => m[1]);
}

function matchesGlob(name: string, glob: string): boolean {
  const re = new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  return re.test(name);
}

describe('drizzle-kit push table filter', () => {
  it('keeps every table and excludes Better Auth tables', () => {
    expect(configSource).toMatch(/tablesFilter:\s*\[\s*['"]\*['"]\s*,/);
    expect(excludedPatterns()).toContain('auth_*');
  });

  it('excludes every table that exists only in SQL migrations', () => {
    const declared = drizzleTables();
    const patterns = excludedPatterns();
    const sqlOnly = [...sqlTables()].filter((t) => !declared.has(t));
    const unprotected = sqlOnly.filter((t) => !patterns.some((p) => matchesGlob(t, p)));
    expect(sqlOnly.length).toBeGreaterThan(0);
    expect(unprotected).toEqual([]);
  });

  it('does not exclude any table that Drizzle manages', () => {
    const patterns = excludedPatterns();
    const hidden = [...drizzleTables()].filter((t) => patterns.some((p) => matchesGlob(t, p)));
    expect(hidden).toEqual([]);
  });
});
