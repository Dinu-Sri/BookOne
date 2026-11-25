import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterAdditive, summarizeSkipped } from '../../db/src/push-filter';

// Statements of the shapes drizzle-kit 0.31 emitted against staging on
// every start (2026-11-25): 92 DROP POLICY, 92 DISABLE RLS, 91 DROP INDEX,
// 35 DROP CONSTRAINT, 33 ADD FOREIGN KEY on existing tables.
const destructive = [
  'DROP POLICY "accounts_isolation" ON "accounts" CASCADE;',
  'ALTER TABLE "accounts" DISABLE ROW LEVEL SECURITY;',
  'DROP INDEX "accounts_tenant_code_idx";',
  'ALTER TABLE "journal_lines" DROP CONSTRAINT "journal_lines_account_id_fkey";',
  'ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;',
  'ALTER TABLE "parties" DROP COLUMN "legacy_code";',
  'DROP TABLE "old_table" CASCADE;',
  'ALTER TABLE "parties" ALTER COLUMN "name" SET DATA TYPE varchar(80);',
];

describe('additive drizzle push filter', () => {
  it('skips every destructive or rebuild statement seen on staging', () => {
    const { apply, skipped } = filterAdditive(destructive);
    expect(apply).toEqual([]);
    expect(skipped).toHaveLength(destructive.length);
    expect(summarizeSkipped(skipped)).toContain('1 drop policy');
    expect(summarizeSkipped(skipped)).toContain('1 disable rls');
  });

  it('applies new tables, columns, types, enum values and indexes', () => {
    const additive = [
      'CREATE TABLE "zz_new" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "tenant_id" uuid NOT NULL);',
      'ALTER TABLE "parties" ADD COLUMN "nickname" varchar(80);',
      'CREATE TYPE "public"."zz_status" AS ENUM(\'a\', \'b\');',
      'ALTER TYPE "public"."zz_status" ADD VALUE \'c\';',
      'CREATE INDEX "zz_new_tenant_idx" ON "zz_new" USING btree ("tenant_id");',
      'CREATE UNIQUE INDEX "zz_new_uq" ON "zz_new" USING btree ("tenant_id","id");',
    ];
    expect(filterAdditive(additive).apply).toEqual(additive);
  });

  it('applies constraints only for tables created in the same run', () => {
    const fkNew =
      'ALTER TABLE "zz_new" ADD CONSTRAINT "zz_new_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;';
    const fkOld =
      'ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;';
    const { apply, skipped } = filterAdditive([
      'CREATE TABLE "zz_new" ("id" uuid PRIMARY KEY NOT NULL, "tenant_id" uuid NOT NULL);',
      fkNew,
      fkOld,
    ]);
    expect(apply).toContain(fkNew);
    expect(apply).not.toContain(fkOld);
    expect(skipped.map((s) => s.kind)).toEqual(['add constraint on existing table']);
  });

  it('startup uses the additive script, never drizzle-kit push --force', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../db/package.json'), 'utf8'));
    expect(pkg.scripts['db:migrate']).toBe('tsx scripts/push-additive.ts');
    expect(pkg.scripts['db:migrate']).not.toMatch(/--force/);
  });
});
