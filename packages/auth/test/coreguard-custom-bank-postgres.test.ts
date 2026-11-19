import { describe, expect, it } from 'vitest';
import { classifyCashJournal, externalCashFlow, rowsFromLines } from '@bookone/accounting';
import { assertPilotTargets } from '../../../scripts/coreguard/allowlist';
import { amountToCents, independentCustomBankOracle, loadCustomBankFixture } from '../../../scripts/coreguard/fixture';

const runPg = process.env.COREGUARD_PILOT === '1' || process.env.COREGUARD_REQUIRE_POSTGRES === '1';

describe('custom-bank service/database slice', () => {
  it.skipIf(!runPg)('creates a bank, posts 300 opening, transfers 100, and isolates companies', async () => {
    const { cleanupPilotSeed, seedPilotCompanies } = await import('../../../scripts/coreguard/seed');
    const {
      accountBalances,
      createCustomBank,
      independentSpendableCents,
      journalLineReadback,
      openLedger,
      postInternalTransfer,
      postOpening,
    } = await import('../../../scripts/coreguard/ledger');
    const { databaseUrl } = assertPilotTargets();
    const fixture = loadCustomBankFixture();
    const oracle = independentCustomBankOracle(fixture);
    const seed = await seedPilotCompanies(databaseUrl);
    const sql = openLedger(databaseUrl);
    try {
      const tenantA = seed.companies.alpha.tenantId;
      const ownerId = seed.companies.alpha.owner.id;
      const created = await createCustomBank(sql, tenantA, ownerId, fixture);
      expect(created.code).toBe(fixture.customBank.code);
      const zero = await accountBalances(sql, tenantA);
      expect(amountToCents(zero[fixture.customBank.code] ?? 0)).toBe(oracle.afterCreate.custom);
      expect(independentSpendableCents(zero)).toBe(oracle.afterCreate.spendable);

      await postOpening(sql, tenantA, ownerId, fixture);
      const opened = await accountBalances(sql, tenantA);
      expect(amountToCents(opened[fixture.customBank.code] ?? 0)).toBe(oracle.afterOpening.custom);
      expect(amountToCents(opened[fixture.ownedBank.code] ?? 0)).toBe(oracle.afterOpening.owned);
      expect(independentSpendableCents(opened)).toBe(oracle.afterOpening.spendable);

      await postInternalTransfer(sql, tenantA, ownerId, fixture);
      const after = await accountBalances(sql, tenantA);
      expect(amountToCents(after[fixture.customBank.code] ?? 0)).toBe(oracle.afterTransfer.custom);
      expect(amountToCents(after[fixture.ownedBank.code] ?? 0)).toBe(oracle.afterTransfer.owned);
      expect(independentSpendableCents(after)).toBe(oracle.afterTransfer.spendable);

      const lines = await journalLineReadback(sql, tenantA);
      const opening = lines.filter((row) => row.date === fixture.opening.date);
      const transfer = lines.filter((row) => row.date === fixture.transfer.date);
      expect(new Set(opening.map((row) => row.journal_id)).size).toBe(1);
      expect(new Set(transfer.map((row) => row.journal_id)).size).toBe(1);
      expect(classifyCashJournal(opening.map((row) => ({ accountCode: row.account_code, side: row.side, amount: Number(row.amount) })))).toBe(
        'funding',
      );
      expect(
        classifyCashJournal(transfer.map((row) => ({ accountCode: row.account_code, side: row.side, amount: Number(row.amount) }))),
      ).toBe('internal_transfer');
      const flow = externalCashFlow(
        transfer.map((row) => ({
          journalId: row.journal_id,
          date: row.date,
          accountCode: row.account_code,
          accountType: row.account_type,
          side: row.side,
          amount: Number(row.amount),
        })),
      );
      expect(flow.moneyIn).toBe(0);
      expect(flow.moneyOut).toBe(0);

      const snapshot = rowsFromLines(
        lines.map((row) => ({
          journalId: row.journal_id,
          date: row.date,
          accountCode: row.account_code,
          accountType: row.account_type,
          side: row.side,
          amount: Number(row.amount),
        })),
      );
      const spendable = snapshot
        .filter((row) => /^10\d{2}$/.test(row.accountCode) || /^11\d{2}$/.test(row.accountCode))
        .reduce((sum, row) => sum + Math.round(row.balance * 100), 0);
      expect(spendable).toBe(oracle.afterTransfer.spendable);

      const tenantB = seed.companies.beta.tenantId;
      const foreign = await accountBalances(sql, tenantB);
      expect(foreign[fixture.customBank.code]).toBeUndefined();
      const [countB] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM accounts WHERE tenant_id = ${tenantB} AND code = ${fixture.customBank.code}
      `;
      expect(countB?.n ?? 0).toBe(0);
    } finally {
      await sql.end({ timeout: 5 });
      await cleanupPilotSeed(databaseUrl, seed);
    }
  });
});
