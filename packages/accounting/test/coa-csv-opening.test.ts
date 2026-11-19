import { describe, expect, it } from 'vitest';
import { dryRunCoaImport, exportCoaCsv, formulaSafeCell, parseCoaCsv } from '../src/coa-csv';
import { previewOpeningBalances } from '../src/opening-balances';
import { validateArchiveAccount, validateCreateAccount } from '../src/account-lifecycle';

describe('COA CSV and opening balances', () => {
  it('dry-run reports duplicate codes and formula-safes export', () => {
    const parsed = parseCoaCsv('code,name,type\n6801,Fuel,expense\n6801,Fuel 2,expense\n');
    const plan = dryRunCoaImport(parsed.rows, []);
    expect(plan.issues.some((issue) => issue.message.includes('Duplicate code'))).toBe(true);
    expect(formulaSafeCell('=cmd')).toBe("'=cmd");
    const csv = exportCoaCsv([{ code: '1101', name: '=HACK', type: 'asset' }]);
    expect(csv).toContain("'=HACK");
  });

  it('opening preview refuses unbalanced and group lines', () => {
    const unbalanced = previewOpeningBalances([
      { accountCode: '1000', debit: 100, credit: 0 },
      { accountCode: '3000', debit: 0, credit: 40 },
    ]);
    expect(unbalanced.balanced).toBe(false);
    const grouped = previewOpeningBalances([{ accountCode: '9000', debit: 10, credit: 0, isGroup: true }]);
    expect(grouped.issues.join(' ')).toMatch(/group/i);
    const ok = previewOpeningBalances([
      { accountCode: '1000', debit: 100, credit: 0 },
      { accountCode: '3000', debit: 0, credit: 100 },
    ]);
    expect(ok.balanced).toBe(true);
  });

  it('create/archive guards preserve used system accounts', () => {
    const created = validateCreateAccount({
      templateId: 'bank',
      code: '1101',
      name: 'HNB',
      existing: [{ code: '1100', name: 'Commercial Bank', type: 'asset' }],
    });
    expect(created.ok).toBe(true);
    const blocked = validateArchiveAccount({
      current: {
        code: '1101',
        name: 'HNB',
        type: 'asset',
        normalSide: 'debit',
        subtype: 'bank',
        purpose: 'tender',
        isGroup: false,
        isSystem: false,
        isContra: false,
        cashFlowClass: 'operating',
        liquidity: 'bank',
        reconcilable: true,
        controlRole: 'bank',
        balance: 300,
      },
    });
    expect(blocked.ok).toBe(false);
  });
});
