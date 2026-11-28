/**
 * CoreGuard database guards — Appendix B Part 1 (49 cases), ported from
 * coreguard-implementation-pack/test/run_guards.sh. Cases run in order on one scratch database.
 * Expected outcomes come from the guide; never change them to make a run pass (guide §4.7).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, runPostgres, type Harness, type Role } from './pg-harness';

const T = '11111111-1111-1111-1111-111111111111';
const T2 = '22222222-2222-2222-2222-222222222222';
const U = '33333333-3333-3333-3333-333333333333';
const BANK = 'a0000000-0000-0000-0000-000000001100';
const AR = 'a0000000-0000-0000-0000-000000001300';
const SALES = 'a0000000-0000-0000-0000-000000004000';
const GRP = 'a0000000-0000-0000-0000-000000001000';
const ARCH = 'a0000000-0000-0000-0000-000000005999';
const OTHER = 'a0000000-0000-0000-0000-000000009100';
const P1 = 'd0000000-0000-0000-0000-00000000000a';
const P2 = 'd0000000-0000-0000-0000-00000000000b';
const PX = 'd0000000-0000-0000-0000-0000000000ff';
const E = 'c0000000-0000-0000-0000-0000000000';

/** Transaction + journal entry header (ids b…/c… with the given 2-hex suffix). */
const tx = (n: string, date: string) =>
  `INSERT INTO transactions(id,tenant_id,user_id,amount,payment_account_id,date) VALUES ('b0000000-0000-0000-0000-0000000000${n}','${T}','${U}',100,'${BANK}','${date}');
INSERT INTO journal_entries(id,tenant_id,user_id,transaction_id,entry_date) VALUES ('${E}${n}','${T}','${U}','b0000000-0000-0000-0000-0000000000${n}','${date}');`;
const ln = (n: string, account: string, side: string, amount: string | number, party = 'NULL') =>
  `('${T}','${E}${n}','${account}','${side}',${amount},${party})`;
const L = 'INSERT INTO journal_lines(tenant_id,journal_entry_id,account_id,side,amount,party_id) VALUES';
const inTenant = (body: string) => `BEGIN; SELECT set_config('app.current_tenant_id','${T}',true); ${body} COMMIT;`;

type Case = { label: string; role?: Role; sql: string | string[]; expect: 'OK' | RegExp; before?: string; after?: string };

const CASES: Case[] = [
  // ── G01 balanced entries
  { label: 'G01 balanced entry accepted', expect: 'OK', sql: `BEGIN; ${tx('01', '2026-01-10')} ${L} ${ln('01', AR, 'debit', 100, `'${P1}'`)},${ln('01', SALES, 'credit', 100)}; COMMIT;` },
  { label: 'G01 unbalanced (100 vs 99.99) refused', expect: /COREGUARD G01/, sql: `BEGIN; ${tx('02', '2026-01-10')} ${L} ${ln('02', BANK, 'debit', 100)},${ln('02', SALES, 'credit', 99.99)}; COMMIT;` },
  { label: 'G01 header without lines refused', expect: /COREGUARD G01|COREGUARD G07/, sql: `BEGIN; ${tx('03', '2026-01-10')} COMMIT;` },
  {
    label: "G01 alone: balanced pair + 'DEBIT' line refused",
    expect: /invalid lines/,
    before: 'ALTER TABLE journal_lines DISABLE TRIGGER cg_g02_lines',
    sql: `BEGIN; ${tx('04', '2026-01-10')} ${L} ${ln('04', BANK, 'debit', 100)},${ln('04', SALES, 'credit', 100)},${ln('04', BANK, 'DEBIT', 5000)}; COMMIT;`,
  },
  {
    label: 'G01 alone: NaN pair refused',
    expect: /invalid lines/,
    sql: `BEGIN; ${tx('05', '2026-01-10')} ${L} ${ln('05', BANK, 'debit', "'NaN'")},${ln('05', SALES, 'credit', "'NaN'")}; COMMIT;`,
    after: 'ALTER TABLE journal_lines ENABLE TRIGGER cg_g02_lines',
  },
  // ── G02 line shape
  { label: 'G02 invalid side refused', expect: /COREGUARD G02: invalid side/, sql: `BEGIN; ${tx('06', '2026-01-10')} ${L} ${ln('06', BANK, 'Debit', 1)}; COMMIT;` },
  { label: 'G02 NaN refused', expect: /COREGUARD G02: amount/, sql: `BEGIN; ${tx('07', '2026-01-10')} ${L} ${ln('07', BANK, 'debit', "'NaN'")}; COMMIT;` },
  { label: 'G02 zero refused', expect: /COREGUARD G02: amount/, sql: `BEGIN; ${tx('08', '2026-01-10')} ${L} ${ln('08', BANK, 'debit', 0)}; COMMIT;` },
  { label: 'G02 negative refused', expect: /COREGUARD G02: amount/, sql: `BEGIN; ${tx('09', '2026-01-10')} ${L} ${ln('09', BANK, 'debit', -5)}; COMMIT;` },
  // ── G03 references
  { label: "G03 other company's account refused", expect: /COREGUARD G03/, sql: `BEGIN; ${tx('10', '2026-01-10')} ${L} ${ln('10', OTHER, 'debit', 1)},${ln('10', SALES, 'credit', 1)}; COMMIT;` },
  { label: 'G03 group account refused', expect: /group account/, sql: `BEGIN; ${tx('11', '2026-01-10')} ${L} ${ln('11', GRP, 'debit', 1)},${ln('11', SALES, 'credit', 1)}; COMMIT;` },
  { label: 'G03 archived account refused', expect: /archived/, sql: `BEGIN; ${tx('12', '2026-01-10')} ${L} ${ln('12', ARCH, 'debit', 1)},${ln('12', SALES, 'credit', 1)}; COMMIT;` },
  { label: "G03 other company's party refused", expect: /party of another company/, sql: `BEGIN; ${tx('13', '2026-01-10')} ${L} ${ln('13', AR, 'debit', 1, `'${PX}'`)},${ln('13', SALES, 'credit', 1)}; COMMIT;` },
  {
    label: "G03 entry on other company's transaction refused",
    expect: /COREGUARD G03/,
    sql: `BEGIN; INSERT INTO transactions(id,tenant_id,user_id,amount,payment_account_id,date) VALUES ('b0000000-0000-0000-0000-0000000000e1','${T2}','${U}',1,'${OTHER}','2026-01-10'); INSERT INTO journal_entries(tenant_id,user_id,transaction_id,entry_date) VALUES ('${T}','${U}','b0000000-0000-0000-0000-0000000000e1','2026-01-10'); COMMIT;`,
  },
  // ── G04 immutability
  { label: 'G04 change line amount refused', expect: /COREGUARD G04/, sql: `UPDATE journal_lines SET amount=200 WHERE journal_entry_id='${E}01' AND side='debit'` },
  { label: 'G04 change line party refused', expect: /COREGUARD G04/, sql: `UPDATE journal_lines SET party_id='${P2}' WHERE journal_entry_id='${E}01' AND side='debit'` },
  { label: 'G04 change line memo allowed', expect: 'OK', sql: `UPDATE journal_lines SET memo='note' WHERE journal_entry_id='${E}01'` },
  { label: 'G04 delete line refused', expect: /COREGUARD G04/, sql: `DELETE FROM journal_lines WHERE journal_entry_id='${E}01'` },
  { label: 'G04 change entry date refused', expect: /COREGUARD G04/, sql: `UPDATE journal_entries SET entry_date='2026-01-11' WHERE id='${E}01'` },
  { label: 'G04 change entry memo allowed', expect: 'OK', sql: `UPDATE journal_entries SET memo='x', notes='y' WHERE id='${E}01'` },
  { label: 'G04 change transaction amount refused', expect: /COREGUARD G04/, sql: `UPDATE transactions SET amount=1 WHERE id='b0000000-0000-0000-0000-000000000001'` },
  { label: 'G04 set reversed_by once allowed', expect: 'OK', sql: `UPDATE transactions SET reversed_by_transaction_id='b0000000-0000-0000-0000-0000000000aa' WHERE id='b0000000-0000-0000-0000-000000000001'` },
  { label: 'G04 change reversed_by again refused', expect: /already reversed/, sql: `UPDATE transactions SET reversed_by_transaction_id='b0000000-0000-0000-0000-0000000000bb' WHERE id='b0000000-0000-0000-0000-000000000001'` },
  { label: 'G04 void a journal entry refused', expect: /COREGUARD G04/, sql: `UPDATE journal_entries SET voided_at=now() WHERE id='${E}01'` },
  // ── G05 period lock and close protocol
  { label: 'close Jan (READ COMMITTED) ok', expect: 'OK', sql: inTenant(`SELECT coreguard.lock_period('${T}','2026-01','${U}','month end');`) },
  {
    label: 'close wrong tenant context refused',
    expect: /tenant context mismatch/,
    sql: `BEGIN; SELECT set_config('app.current_tenant_id','${T2}',true); SELECT coreguard.lock_period('${T}','2026-02','${U}','x'); COMMIT;`,
  },
  {
    label: 'close in REPEATABLE READ refused',
    expect: /must run in READ COMMITTED/,
    sql: `BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT set_config('app.current_tenant_id','${T}',true); SELECT coreguard.lock_period('${T}','2026-02','${U}','x'); COMMIT;`,
  },
  { label: 'post into locked Jan refused', expect: /period 2026-01 is locked/, sql: `BEGIN; ${tx('20', '2026-01-31')} ${L} ${ln('20', BANK, 'debit', 5)},${ln('20', SALES, 'credit', 5)}; COMMIT;` },
  {
    label: 'stock movement in locked Jan refused',
    expect: /period 2026-01 is locked/,
    sql: `INSERT INTO inventory_movements(tenant_id,movement_type,product_id,quantity,movement_date) VALUES ('${T}','adjust','e0000000-0000-0000-0000-000000000001',1,'2026-01-15')`,
  },
  {
    label: 'posting in REPEATABLE READ refused',
    expect: /ledger writes must run in READ COMMITTED/,
    sql: `BEGIN ISOLATION LEVEL REPEATABLE READ; ${tx('21', '2026-02-02')} ${L} ${ln('21', BANK, 'debit', 5)},${ln('21', SALES, 'credit', 5)}; COMMIT;`,
  },
  { label: 'delete a period lock refused', expect: /unlock_period/, sql: `DELETE FROM period_locks` },
  { label: 'insert a second active lock for Jan refused', expect: /cg_period_locks_active_uidx/, sql: `INSERT INTO period_locks(tenant_id,user_id,period) VALUES ('${T}','${U}','2026-01')` },
  { label: 'reopen Jan without reason refused', expect: /reason is required/, sql: inTenant(`SELECT coreguard.unlock_period('${T}','2026-01','${U}','');`) },
  { label: 'reopen Jan with reason ok', expect: 'OK', sql: inTenant(`SELECT coreguard.unlock_period('${T}','2026-01','${U}','correct a receipt');`) },
  { label: 'relock by flipping status refused', expect: /COREGUARD G04/, sql: `UPDATE period_locks SET status='locked' WHERE period='2026-01'` },
  { label: 'relock via lock_period ok', expect: 'OK', sql: inTenant(`SELECT coreguard.lock_period('${T}','2026-01','${U}','relock');`) },
];

const CASES_AFTER_FINGERPRINT: Case[] = [
  {
    label: 'close refused when G05 trigger disabled',
    expect: /period-lock trigger missing or disabled/,
    before: 'ALTER TABLE journal_entries DISABLE TRIGGER cg_g05_entries',
    sql: inTenant(`SELECT coreguard.lock_period('${T}','2026-03','${U}','x');`),
    after: 'ALTER TABLE journal_entries ENABLE TRIGGER cg_g05_entries',
  },
  // ── G06 field validity
  { label: 'invalid date 2026-02-30 refused', expect: /COREGUARD G06: invalid transaction date/, sql: `BEGIN; ${tx('30', '2026-02-30')} COMMIT;` },
  { label: 'transaction amount NaN refused', expect: /COREGUARD G06/, sql: `INSERT INTO transactions(tenant_id,user_id,amount,payment_account_id,date) VALUES ('${T}','${U}','NaN','${BANK}','2026-02-03')` },
  { label: 'document amount NaN refused', expect: /COREGUARD G06: document amounts/, sql: `INSERT INTO business_documents(tenant_id,document_type,total) VALUES ('${T}','sales_invoice','NaN')` },
  // ── G07 / G09 completeness and seal
  { label: 'transaction without journal refused', expect: /COREGUARD G07/, sql: `INSERT INTO transactions(tenant_id,user_id,amount,payment_account_id,date) VALUES ('${T}','${U}',5,'${BANK}','2026-02-03')` },
  {
    label: 'two journal headers for one transaction refused',
    expect: /cg_one_live_entry_per_tx/,
    sql: `BEGIN; ${tx('31', '2026-02-03')} INSERT INTO journal_entries(tenant_id,user_id,transaction_id,entry_date) VALUES ('${T}','${U}','b0000000-0000-0000-0000-000000000031','2026-02-03'); COMMIT;`,
  },
  { label: 'append balanced pair to posted entry refused', expect: /COREGUARD G09/, sql: `BEGIN; ${L} ${ln('01', BANK, 'debit', 5000)},${ln('01', SALES, 'credit', 5000)}; COMMIT;` },
  {
    label: 'header and lines in separate commits refused',
    expect: /COREGUARD G0[179]/,
    sql: [tx('32', '2026-02-04'), `${L} ${ln('32', BANK, 'debit', 1)},${ln('32', SALES, 'credit', 1)}`],
  },
  // ── maintenance authorisation
  {
    label: 'app login using maintenance refused',
    expect: /not allowed to use ledger maintenance/,
    sql: `BEGIN; SET LOCAL bookone.ledger_maintenance='archive_restore'; DELETE FROM journal_lines WHERE journal_entry_id='${E}01'; COMMIT;`,
  },
  {
    label: 'maintenance login: unknown reason refused',
    role: 'maint',
    expect: /unknown maintenance reason/,
    sql: `BEGIN; SET LOCAL bookone.ledger_maintenance='hack'; DELETE FROM journal_lines WHERE journal_entry_id='${E}01'; COMMIT;`,
  },
  {
    label: 'maintenance login: cleanup allowed',
    role: 'maint',
    expect: 'OK',
    sql: `BEGIN; SET LOCAL bookone.ledger_maintenance='coreguard_cleanup'; UPDATE journal_lines SET memo='m' WHERE journal_entry_id='${E}01'; COMMIT;`,
  },
];

describe.skipIf(!runPostgres)('CoreGuard guards (Appendix B Part 1, 49 cases)', () => {
  let h: Harness;
  const ran: string[] = [];

  beforeAll(async () => {
    h = await createHarness('guards');
    await h.exec(
      'admin',
      `INSERT INTO users VALUES ('${U}');
       INSERT INTO tenants(id,name) VALUES ('${T}','T1'),('${T2}','T2');
       INSERT INTO parties(id,tenant_id,name) VALUES ('${P1}','${T}','Customer One'),('${P2}','${T}','Parent Ltd'),('${PX}','${T2}','Other co party');
       INSERT INTO accounts(id,tenant_id,code,name,type,normal_side,control_role,is_group,is_active) VALUES
        ('${BANK}','${T}','1100','Bank','asset','debit','bank','0','1'),('${AR}','${T}','1300','AR','asset','debit','ar','0','1'),
        ('${SALES}','${T}','4000','Sales','income','credit',NULL,'0','1'),('${GRP}','${T}','1000','Assets','asset','debit',NULL,'1','1'),
        ('${ARCH}','${T}','5999','Old','expense','debit',NULL,'0','0'),('${OTHER}','${T2}','9100','Other co','asset','debit',NULL,'0','1');`,
    ).then((err) => {
      if (err) throw new Error(`fixture failed: ${err}`);
    });
  });

  afterAll(async () => {
    await h?.drop();
  });

  async function runCase(c: Case) {
    if (c.before) expect(await h.exec('admin', c.before)).toBeNull();
    const statements = Array.isArray(c.sql) ? c.sql : [c.sql];
    const errors: string[] = [];
    for (const statement of statements) {
      const err = await h.exec(c.role ?? 'app', statement);
      if (err) errors.push(err);
    }
    if (c.after) expect(await h.exec('admin', c.after)).toBeNull();
    ran.push(c.label);
    if (c.expect === 'OK') {
      expect(errors, c.label).toEqual([]);
    } else {
      expect(errors.join('\n'), c.label).toMatch(c.expect);
    }
  }

  for (const c of CASES) {
    it(c.label, () => runCase(c));
  }

  it('fingerprints after reopen+relock: 1 superseded, 1 active', async () => {
    ran.push('fingerprints');
    const fp = await h.scalar(
      'admin',
      `select count(*) filter (where superseded_at is not null)||'|'||count(*) filter (where superseded_at is null) from coreguard.period_fingerprints`,
    );
    expect(fp).toBe('1|1');
  });

  for (const c of CASES_AFTER_FINGERPRINT) {
    it(c.label, () => runCase(c));
  }

  it('bypass_log recorded the maintenance statement', async () => {
    ran.push('bypass_log');
    const n = await h.scalar('admin', `select count(*) from coreguard.bypass_log where reason='coreguard_cleanup'`);
    expect(Number(n)).toBeGreaterThan(0);
  });

  it('ran all 49 Part 1 cases', () => {
    expect(ran).toHaveLength(49);
  });
});
