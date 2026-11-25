/**
 * Keep only additive statements from a drizzle-kit push diff.
 *
 * The Drizzle schema declares tables and columns, but RLS, policies, most
 * indexes and many constraints live in SQL migrations (packages/db/migrations).
 * drizzle-kit 0.31 diffs those too, so a plain `push --force` on every start
 * dropped 92 policies, disabled RLS on 92 tables, dropped 91 indexes and
 * rebuilt 33 foreign keys, which the SQL migrations then recreated.
 *
 * Production rule: schema changes are additive. This filter applies new
 * tables, columns, types, enum values, sequences, indexes, and constraints on
 * tables created in the same run. Everything else is skipped and reported.
 */

export type PushFilterResult = {
  apply: string[];
  skipped: Array<{ kind: string; statement: string }>;
};

const TABLE_IN_ALTER = /^ALTER\s+TABLE\s+(?:"?[\w]+"?\.)?"?([\w]+)"?/i;
const TABLE_IN_CREATE = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?[\w]+"?\.)?"?([\w]+)"?/i;

function kindOf(statement: string): string {
  const words = statement.replace(/"[^"]*"/g, 'X').split(/\s+/).slice(0, 5).join(' ').toUpperCase();
  if (/^DROP POLICY/.test(words)) return 'drop policy';
  if (/DISABLE ROW LEVEL SECURITY/i.test(statement)) return 'disable rls';
  if (/^DROP INDEX/.test(words)) return 'drop index';
  if (/^DROP TABLE/.test(words)) return 'drop table';
  if (/DROP COLUMN/i.test(statement)) return 'drop column';
  if (/DROP CONSTRAINT/i.test(statement)) return 'drop constraint';
  if (/ADD CONSTRAINT/i.test(statement)) return 'add constraint on existing table';
  if (/ALTER COLUMN/i.test(statement)) return 'alter column';
  return words.toLowerCase();
}

export function filterAdditive(statements: readonly string[]): PushFilterResult {
  const apply: string[] = [];
  const skipped: PushFilterResult['skipped'] = [];
  const createdTables = new Set<string>();

  for (const raw of statements) {
    const m = raw.match(TABLE_IN_CREATE);
    if (m?.[1]) createdTables.add(m[1].toLowerCase());
  }

  for (const raw of statements) {
    const s = raw.trim();
    if (!s) continue;
    const additive =
      /^CREATE\s+TABLE\b/i.test(s) ||
      /^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(s) ||
      /^CREATE\s+(TYPE|SCHEMA|SEQUENCE)\b/i.test(s) ||
      /^ALTER\s+TYPE\b[\s\S]*\bADD\s+VALUE\b/i.test(s) ||
      /^ALTER\s+TABLE\b[^;]*\bADD\s+COLUMN\b/i.test(s);
    if (additive) {
      apply.push(s);
      continue;
    }
    const table = s.match(TABLE_IN_ALTER)?.[1]?.toLowerCase();
    const constraintOnNewTable =
      table !== undefined &&
      createdTables.has(table) &&
      /\bADD\s+CONSTRAINT\b/i.test(s) &&
      !/\bDROP\b/i.test(s);
    if (constraintOnNewTable) {
      apply.push(s);
      continue;
    }
    skipped.push({ kind: kindOf(s), statement: s });
  }
  return { apply, skipped };
}

export function summarizeSkipped(skipped: PushFilterResult['skipped']): string {
  const counts = new Map<string, number>();
  for (const { kind } of skipped) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${n} ${kind}`)
    .join(', ');
}
