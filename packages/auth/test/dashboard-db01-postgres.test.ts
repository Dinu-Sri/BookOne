import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DB01_JOURNALS, DB01_PERIOD, DB01_TENANT_B_JOURNALS, independentExpected } from '@bookone/accounting';

const databaseUrl = process.env.DATABASE_URL?.trim();
const requirePg = Boolean(process.env.GITHUB_ACTIONS || process.env.DB01_REQUIRE_POSTGRES);

describe('CoreGuard Dashboard DB-01 postgres path', () => {
  it('publication CoreGuard job runs DB-01 with a database URL', () => {
    const yaml = readFileSync(path.resolve(__dirname, '../../../.github/workflows/docker-web.yml'), 'utf8');
    expect(yaml).toMatch(/Dashboard DB-01/);
    expect(yaml).toMatch(/dashboard-metrics\.test\.ts/);
    expect(yaml).toMatch(/dashboard-db01\.spec\.ts/);
    expect(yaml).toMatch(/needs: \[quality, coreguard\]/);
  });

  it.skipIf(!databaseUrl && !requirePg)('aggregates fixture journals with SQL independently of composeDashboardMetrics', async () => {
    if (!databaseUrl) {
      throw new Error('BLOCKED: DATABASE_URL is required for DB-01 postgres proof.');
    }
    const { Client } = await import('pg');
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const started = Date.now();
    try {
      await client.query(`
        CREATE TEMP TABLE db01_journals (
          tenant_id text NOT NULL,
          journal_id text NOT NULL,
          entry_date date NOT NULL,
          account_code text NOT NULL,
          account_type text NOT NULL,
          side text NOT NULL,
          amount numeric(18,2) NOT NULL,
          voided boolean NOT NULL DEFAULT false
        )
      `);
      for (const line of [...DB01_JOURNALS, ...DB01_TENANT_B_JOURNALS]) {
        await client.query(
          `INSERT INTO db01_journals (tenant_id, journal_id, entry_date, account_code, account_type, side, amount, voided)
           VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8)`,
          [
            line.tenantId,
            line.journalId,
            line.date,
            line.accountCode,
            line.accountType,
            line.side,
            line.amount,
            Boolean(line.voided),
          ],
        );
      }
      const expected = independentExpected();
      const sales = await client.query(
        `SELECT COALESCE(SUM(CASE
            WHEN account_type = 'revenue' AND side = 'credit' THEN amount
            WHEN account_type = 'revenue' AND side = 'debit' THEN -amount
            ELSE 0 END),0)::numeric AS net_sales
         FROM db01_journals
         WHERE voided = false AND tenant_id = 'tenant-a'
           AND account_code IN ('4000','4100')
           AND entry_date BETWEEN $1::date AND $2::date`,
        [DB01_PERIOD.from, DB01_PERIOD.to],
      );
      const result = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN account_type = 'revenue' AND side = 'credit' THEN amount WHEN account_type = 'revenue' AND side = 'debit' THEN -amount ELSE 0 END),0)
           - COALESCE(SUM(CASE WHEN account_type = 'expense' AND side = 'debit' THEN amount WHEN account_type = 'expense' AND side = 'credit' THEN -amount ELSE 0 END),0)
           AS operating_result
         FROM db01_journals
         WHERE voided = false AND tenant_id = 'tenant-a'
           AND entry_date BETWEEN $1::date AND $2::date`,
        [DB01_PERIOD.from, DB01_PERIOD.to],
      );
      const isolation = await client.query(
        `SELECT COALESCE(SUM(CASE WHEN account_code = '4000' AND side = 'credit' THEN amount ELSE 0 END),0)::numeric AS other
         FROM db01_journals
         WHERE tenant_id = 'tenant-b' AND entry_date BETWEEN $1::date AND $2::date`,
        [DB01_PERIOD.from, DB01_PERIOD.to],
      );
      expect(Number(sales.rows[0]?.net_sales)).toBe(expected.netSales);
      expect(Number(result.rows[0]?.operating_result)).toBe(expected.operatingResult);
      expect(Number(isolation.rows[0]?.other)).toBe(0);
      const elapsed = Date.now() - started;
      expect(elapsed).toBeLessThan(15_000);
    } finally {
      await client.end();
    }
  });
});
