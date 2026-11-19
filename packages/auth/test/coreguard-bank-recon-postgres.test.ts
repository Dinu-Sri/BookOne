import { describe, expect, it } from 'vitest';
import { assertPilotTargets } from '../../../scripts/coreguard/allowlist';
import { amountToCents, independentBankReconOracle, loadBankReconFixture } from '../../../scripts/coreguard/fixture';

const runPg = process.env.COREGUARD_PILOT === '1' || process.env.COREGUARD_REQUIRE_POSTGRES === '1';

describe('bank-recon service/database slice', () => {
  it.skipIf(!runPg)('seeds 1102 at 1485 with five journals and isolates companies', async () => {
    const { cleanupPilotSeed, seedPilotCompanies } = await import('../../../scripts/coreguard/seed');
    const {
      accountBalances,
      journalCount,
      openLedger,
      seedBankReconLedger,
    } = await import('../../../scripts/coreguard/ledger');
    const { databaseUrl } = assertPilotTargets();
    const fixture = loadBankReconFixture();
    const oracle = independentBankReconOracle(fixture);
    const seed = await seedPilotCompanies(databaseUrl);
    const sql = openLedger(databaseUrl);
    try {
      const tenantA = seed.companies.alpha.tenantId;
      const ownerId = seed.companies.alpha.owner.id;
      const seeded = await seedBankReconLedger(sql, tenantA, ownerId, fixture);
      expect(seeded.journalCount).toBe(oracle.afterSeed.journals);
      const balances = await accountBalances(sql, tenantA);
      expect(amountToCents(balances[fixture.bank.code] ?? 0)).toBe(oracle.afterSeed.bank);
      expect(await journalCount(sql, tenantA)).toBe(oracle.afterSeed.journals);

      const tenantB = seed.companies.beta.tenantId;
      const foreign = await accountBalances(sql, tenantB);
      expect(foreign[fixture.bank.code]).toBeUndefined();
      const [countB] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM accounts WHERE tenant_id = ${tenantB} AND code = ${fixture.bank.code}
      `;
      expect(countB?.n ?? 0).toBe(0);
    } finally {
      await sql.end({ timeout: 5 });
      await cleanupPilotSeed(databaseUrl, seed);
    }
  });
});
