/**
 * CoreGuard flows that need only migrations 060–063 — Appendix B Part 2: C1 and the five A5 cases (6 cases),
 * ported from coreguard-implementation-pack/test/run_flows.sh. C2/C3/C4 arrive with 064 (Step 7a),
 * G10 with 065 (PR 7i), G11 with 066 (Step 8), the hash chain with 067 (Step 11).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, runPostgres, type Harness } from './pg-harness';

const T = '11111111-1111-1111-1111-111111111111';
const U = '33333333-3333-3333-3333-333333333333';
const BANK = 'a0000000-0000-0000-0000-000000001100';
const SALES = 'a0000000-0000-0000-0000-000000004000';
const R1 = 'a5000000-0000-0000-0000-000000000001';
const R2 = 'a5000000-0000-0000-0000-000000000002';
const R3 = 'a5000000-0000-0000-0000-000000000003';

const post = (n: string, date: string, amount: number) =>
  `INSERT INTO transactions(id,tenant_id,user_id,amount,payment_account_id,date) VALUES ('b0000000-0000-0000-0000-0000000001${n}','${T}','${U}',${amount},'${BANK}','${date}');
   INSERT INTO journal_entries(id,tenant_id,user_id,transaction_id,entry_date) VALUES ('c0000000-0000-0000-0000-0000000001${n}','${T}','${U}','b0000000-0000-0000-0000-0000000001${n}','${date}');
   INSERT INTO journal_lines(tenant_id,journal_entry_id,account_id,side,amount) VALUES ('${T}','c0000000-0000-0000-0000-0000000001${n}','${BANK}','debit',${amount}),('${T}','c0000000-0000-0000-0000-0000000001${n}','${SALES}','credit',${amount});`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!runPostgres)('CoreGuard flows on 060–063 (C1 + A5, 6 cases)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness('flows');
    const err = await h.exec(
      'admin',
      `INSERT INTO users VALUES ('${U}');
       INSERT INTO tenants(id,name) VALUES ('${T}','T1');
       INSERT INTO accounts(id,tenant_id,code,name,type,normal_side,control_role,is_group,is_active) VALUES
        ('${BANK}','${T}','1100','Bank','asset','debit','bank','0','1'),
        ('${SALES}','${T}','4000','Sales','income','credit',NULL,'0','1');
       INSERT INTO coreguard.runs(id,kind,trigger,product_version,product_sha,coreguard_version,ruleset_hash)
         SELECT x,'sentinel_full','schedule','t','t','2.0.0','h' FROM unnest(array['${R1}','${R2}','${R3}']::uuid[]) x;`,
    );
    if (err) throw new Error(`fixture failed: ${err}`);
  });

  afterAll(async () => {
    await h?.drop();
  });

  it('C1 posting in flight while April is closed: close waits, fingerprint matches the ledger', async () => {
    // Connection 1 posts into April and holds its transaction for 3 s (shared tenant-month lock from G05).
    const poster = h.connect('app');
    const closer = h.connect('app');
    try {
      // postgres.js queries are lazy: execute() sends it now.
      const inFlight = poster.unsafe(`BEGIN; ${post('01', '2026-04-30', 999)} SELECT pg_sleep(3); COMMIT;`).execute();
      await sleep(1000);
      // Connection 2 closes April: lock_period takes the exclusive lock, so it must wait for connection 1.
      const started = Date.now();
      await closer.unsafe(
        `BEGIN; SELECT set_config('app.current_tenant_id','${T}',true); SELECT coreguard.lock_period('${T}','2026-04','${U}','month end'); COMMIT;`,
      );
      const waitedSeconds = (Date.now() - started) / 1000;
      await inFlight;
      const fingerprint = await h.scalar(
        'admin',
        `select tb_json->'4000'->>'credit_cents' from coreguard.period_fingerprints where period='2026-04' and superseded_at is null`,
      );
      const ledger = await h.scalar(
        'admin',
        `select sum((amount*100)::bigint) from journal_lines jl join journal_entries je on je.id=jl.journal_entry_id
          join accounts a on a.id=jl.account_id where a.code='4000' and jl.side='credit' and je.entry_date<='2026-04-30'`,
      );
      expect(waitedSeconds).toBeGreaterThan(1.5);
      expect(ledger).toBe('99900');
      expect(fingerprint).toBe(ledger);
    } finally {
      await poster.end({ timeout: 5 });
      await closer.end({ timeout: 5 });
    }
  });

  describe('A5 findings: acknowledge, timeout, recheck', () => {
    it('run 1: red', async () => {
      const err = await h.exec(
        'admin',
        `SELECT coreguard.record_check_result('${R1}','${T}','CG-A01','violations',NULL,'[{"fp":"CG-A01|${T}|ar","severity":"critical","difference_cents":10000,"subject":{"control":"ar"},"message":"AR differs"}]')`,
      );
      expect(err).toBeNull();
      expect(await h.scalar('admin', `select coreguard.tenant_status('${T}','${R1}')`)).toBe('red');
    });

    it('after acknowledge: still red', async () => {
      expect(await h.exec('admin', `UPDATE coreguard.findings SET acknowledged_by='${U}', acknowledged_at=now(), acknowledge_note='on it'`)).toBeNull();
      expect(await h.scalar('admin', `select coreguard.tenant_status('${T}','${R1}')`)).toBe('red');
    });

    it('after timeout: finding open, ack kept', async () => {
      // The check times out inside its savepoint; the run records outcome 'error', which never changes findings.
      // The worker's per-check protocol (§6.8.2), one statement at a time on one connection: the check times out
      // inside its savepoint, is rolled back to it, and the run records outcome 'error' (which never changes findings).
      // (The reference script sends all of this as one psql -c string, which the timeout aborts before recording.)
      const conn = h.connect('admin');
      let timedOut = false;
      try {
        await conn.unsafe('BEGIN');
        await conn.unsafe('SAVEPOINT cg_check');
        await conn.unsafe(`SET LOCAL statement_timeout='200ms'`);
        try {
          await conn.unsafe('SELECT pg_sleep(1)');
        } catch (error) {
          timedOut = /statement timeout/.test(String((error as Error).message));
        }
        await conn.unsafe('ROLLBACK TO SAVEPOINT cg_check');
        await conn.unsafe(
          `SELECT coreguard.record_check_result('${R2}','${T}','CG-A01','error','canceling statement due to statement timeout',NULL)`,
        );
        await conn.unsafe('COMMIT');
      } finally {
        await conn.end({ timeout: 5 });
      }
      expect(timedOut).toBe(true);
      expect(await h.scalar('admin', `select outcome from coreguard.check_results where run_id='${R2}'`)).toBe('error');
      expect(await h.scalar('admin', `select status||'|'||(acknowledged_by is not null) from coreguard.findings`)).toBe('open|true');
    });

    it('after timeout: still red', async () => {
      expect(await h.scalar('admin', `select coreguard.tenant_status('${T}','${R2}')`)).toBe('red');
    });

    it('recheck clean: resolved, green', async () => {
      expect(await h.exec('admin', `SELECT coreguard.record_check_result('${R3}','${T}','CG-A01','passed',NULL,'[]')`)).toBeNull();
      expect(await h.scalar('admin', `select f.status||'|'||coreguard.tenant_status('${T}','${R3}') from coreguard.findings f`)).toBe(
        'resolved|green',
      );
    });
  });
});
