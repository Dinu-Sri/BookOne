import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dryRunCoaImport, exportCoaCsv, formulaSafeCell, parseCoaCsv } from '../src/coa-csv';
import { previewOpeningBalances } from '../src/opening-balances';
import { chartOfAccountsForEntity } from '../src/coa-packs';
import { loadCustomBankFixture } from '../../../scripts/coreguard/fixture';

const csvPath = path.resolve(__dirname, '../../../docs/coreguard/fixtures/setup-order.v1.csv');
const bank = loadCustomBankFixture();

describe('pilot setup-order synthetic rehearsal', () => {
  it('dry-runs the versioned CSV against the company pack and formula-safes export', () => {
    const raw = readFileSync(csvPath, 'utf8');
    const parsed = parseCoaCsv(raw);
    expect(parsed.rows.map((row) => row.code)).toContain('1101');
    expect(parsed.rows.map((row) => row.code)).toContain('6801');

    const existing = chartOfAccountsForEntity('company').map((account) => ({
      code: account.code,
      name: account.name,
      type: account.type,
      isActive: true,
    }));
    const plan = dryRunCoaImport(parsed.rows, existing);
    expect(plan.creates.some((row) => row.code === '1101')).toBe(true);
    expect(plan.creates.some((row) => row.code === '6801')).toBe(true);
    expect(plan.creates.some((row) => row.code === '1100')).toBe(false);
    expect(plan.issues.length).toBeGreaterThan(0);
    expect(formulaSafeCell('=HACK')).toBe("'=HACK");
    expect(exportCoaCsv([{ code: '1101', name: '=HACK', type: 'asset' }])).toContain("'=HACK");
  });

  it('opening preview matches the custom-bank fixture and refuses a repeat unbalanced set', () => {
    const preview = previewOpeningBalances([
      { accountCode: bank.opening.debitAccount, debit: bank.opening.debitCents / 100, credit: 0 },
      { accountCode: bank.opening.creditAccount, debit: 0, credit: bank.opening.creditCents / 100 },
    ]);
    expect(preview.balanced).toBe(true);
    expect(preview.debitTotal).toBe(300);
    expect(preview.creditTotal).toBe(300);
    expect(preview.fingerprint).toBe('1101:300/0|3000:0/300');

    const again = previewOpeningBalances([
      { accountCode: bank.opening.debitAccount, debit: 300, credit: 0 },
      { accountCode: bank.opening.creditAccount, debit: 0, credit: 300 },
    ]);
    expect(again.fingerprint).toBe(preview.fingerprint);

    const unbalanced = previewOpeningBalances([
      { accountCode: '1101', debit: 300, credit: 0 },
      { accountCode: '3000', debit: 0, credit: 40 },
    ]);
    expect(unbalanced.balanced).toBe(false);
    expect(unbalanced.issues.join(' ')).toMatch(/balance/i);
  });
});
