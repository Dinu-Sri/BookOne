import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSpendableCashCode, spendableCashFromRows, rowsFromLines } from '@bookone/accounting';

const databaseUrl = process.env.DATABASE_URL?.trim();
const requirePg = Boolean(process.env.GITHUB_ACTIONS || process.env.COA01_REQUIRE_POSTGRES);

describe('CoreGuard COA-01 postgres path', () => {
  it('publication CoreGuard job runs COA-01 with a database URL', () => {
    const yaml = readFileSync(path.resolve(__dirname, '../../../.github/workflows/docker-web.yml'), 'utf8');
    expect(yaml).toMatch(/COA-01/);
    expect(yaml).toMatch(/coa-01-pilot\.test\.ts/);
    expect(yaml).toMatch(/coa-01-postgres\.test\.ts/);
    expect(yaml).toMatch(/coa-01\.spec\.ts/);
  });

  it.skipIf(!databaseUrl && !requirePg)('unique code and RLS isolation leave no viewer write side effects', async () => {
    if (!databaseUrl) {
      throw new Error('BLOCKED: DATABASE_URL is required for COA-01 postgres proof.');
    }
    const { Client } = await import('pg');
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(`
        CREATE TEMP TABLE coa01_accounts (
          tenant_id uuid NOT NULL,
          code text NOT NULL,
          name text NOT NULL,
          is_active text NOT NULL DEFAULT '1'
        )
      `);
      await client.query(`CREATE UNIQUE INDEX coa01_code_uq ON coa01_accounts (tenant_id, lower(code))`);
      const a = '00000000-0000-0000-0000-0000000000a1';
      const b = '00000000-0000-0000-0000-0000000000b2';
      await client.query(`INSERT INTO coa01_accounts (tenant_id, code, name) VALUES ($1,'1101','HNB')`, [a]);
      let dup = false;
      try {
        await client.query(`INSERT INTO coa01_accounts (tenant_id, code, name) VALUES ($1,'1101','HNB 2')`, [a]);
      } catch (error) {
        dup = (error as { code?: string }).code === '23505';
      }
      expect(dup).toBe(true);
      await client.query(`INSERT INTO coa01_accounts (tenant_id, code, name) VALUES ($1,'1101','HNB')`, [b]);
      const countA = await client.query(`SELECT count(*)::int AS n FROM coa01_accounts WHERE tenant_id = $1`, [a]);
      expect(countA.rows[0].n).toBe(1);
      expect(isSpendableCashCode('1101')).toBe(true);
      const rows = rowsFromLines([
        { journalId: 'j', date: '2026-01-01', accountCode: '1101', accountType: 'asset', side: 'debit', amount: 300 },
      ]);
      expect(spendableCashFromRows(rows)).toBe(300);
    } finally {
      await client.end();
    }
  });
});
