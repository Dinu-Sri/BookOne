import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL?.trim();

describe('AB-06 PostgreSQL facts-key claim and document CAS', () => {
  it('PostgresStore claims with ON CONFLICT DO NOTHING and CASes proposal_revision', () => {
    const runtime = readFileSync(
      path.resolve(__dirname, '../../../apps/web/src/lib/agent-bridge-runtime.ts'),
      'utf8',
    );
    expect(runtime).toMatch(/async claimFactsKey/);
    expect(runtime).toMatch(/onConflictDoNothing/);
    expect(runtime).toMatch(/async casDocument/);
    expect(runtime).toMatch(/proposalRevision, expectedRevision/);
    expect(runtime).not.toMatch(/set\(\{ payloadHash: row\.payloadHash, documentId: row\.documentId \}\)/);
  });

  it.skipIf(!databaseUrl)('INSERT ON CONFLICT DO NOTHING keeps the first payload binding', async () => {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(`
        CREATE TEMP TABLE ab06_facts_keys (
          tenant_id uuid NOT NULL,
          key varchar(120) NOT NULL,
          payload_hash varchar(64) NOT NULL,
          document_id uuid NOT NULL,
          PRIMARY KEY (tenant_id, key)
        )
      `);
      const tenantId = '00000000-0000-4000-8000-000000000099';
      const key = 'upload:one';
      const docA = '00000000-0000-4000-8000-000000000001';
      const docB = '00000000-0000-4000-8000-000000000002';
      const first = await client.query(
        `INSERT INTO ab06_facts_keys (tenant_id, key, payload_hash, document_id)
         VALUES ($1::uuid, $2, 'hash-one', $3::uuid)
         ON CONFLICT (tenant_id, key) DO NOTHING
         RETURNING document_id`,
        [tenantId, key, docA],
      );
      const second = await client.query(
        `INSERT INTO ab06_facts_keys (tenant_id, key, payload_hash, document_id)
         VALUES ($1::uuid, $2, 'hash-two', $3::uuid)
         ON CONFLICT (tenant_id, key) DO NOTHING
         RETURNING document_id`,
        [tenantId, key, docB],
      );
      const rows = await client.query(
        `SELECT payload_hash, document_id FROM ab06_facts_keys WHERE tenant_id = $1::uuid AND key = $2`,
        [tenantId, key],
      );
      expect(first.rowCount).toBe(1);
      expect(second.rowCount).toBe(0);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.payload_hash).toBe('hash-one');
      expect(String(rows.rows[0]?.document_id)).toBe(docA);
    } finally {
      await client.end();
    }
  });
});
