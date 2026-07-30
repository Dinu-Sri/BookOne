import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { interpretAmount } from '../src/amount-rules';
import {
  loadWorkbookMatrix,
  suggestStudioMapping,
  transformStudioMatrix,
} from '../src/studio-transform';

const SAMPATH = 'C:/Users/dinus/Downloads/Statement.xlsx';
const HNB = 'C:/Users/dinus/Downloads/42504_SRReport_1785226727445.xls';

describe('interpretAmount modes', () => {
  it('A: debit_credit', () => {
    const r = interpretAmount(['x', '100', ''], {
      mode: 'debit_credit',
      moneyOutCol: 1,
      moneyInCol: 2,
    });
    expect(r.signedAmount).toBe(-100);
    expect(r.direction).toBe('out');
  });

  it('C: amount_with_type DR/CR', () => {
    const out = interpretAmount(['5000', 'D'], {
      mode: 'amount_with_type',
      amountCol: 0,
      typeCol: 1,
      drMeansOut: true,
    });
    expect(out.signedAmount).toBe(-5000);
    const inn = interpretAmount(['5000', 'C'], {
      mode: 'amount_with_type',
      amountCol: 0,
      typeCol: 1,
      drMeansOut: true,
    });
    expect(inn.signedAmount).toBe(5000);
  });

  it('blocks unknown label', () => {
    const r = interpretAmount(['100', 'ZZ'], {
      mode: 'amount_with_type',
      amountCol: 0,
      typeCol: 1,
    });
    expect(r.error).toBe('unknown_money_label');
  });

  it('blocks both in and out filled', () => {
    const r = interpretAmount(['50', '50'], {
      mode: 'debit_credit',
      moneyOutCol: 0,
      moneyInCol: 1,
    });
    expect(r.error).toBe('both_in_and_out');
  });
});

describe.runIf(existsSync(SAMPATH))('Studio transform Sampath', () => {
  it('suggests amount_with_type and parses correctly', () => {
    const buf = readFileSync(SAMPATH);
    const { matrix } = loadWorkbookMatrix(buf, 'Statement.xlsx');
    const mapping = suggestStudioMapping(matrix);
    expect(mapping.amountRules.mode).toBe('amount_with_type');
    const result = transformStudioMatrix(matrix, mapping, {
      tenantId: 't1',
      bankAccountId: 'b1',
    });
    expect(result.lines.length).toBeGreaterThan(10);
    expect(result.errorCount).toBe(0);
    const first = result.lines.find((l) => l.description.includes('CEFT - credit card bill'));
    expect(first?.signedAmount).toBe(5000);
    const debit = result.lines.find((l) => l.description.startsWith('SVR-'));
    expect(debit && debit.signedAmount < 0).toBe(true);
  });
});

describe.runIf(existsSync(HNB))('Studio transform HNB report', () => {
  it('suggests debit_credit and parses ATM withdrawal', () => {
    const buf = readFileSync(HNB);
    const { matrix } = loadWorkbookMatrix(buf, 'report.xls');
    const mapping = suggestStudioMapping(matrix);
    expect(mapping.amountRules.mode).toBe('debit_credit');
    const result = transformStudioMatrix(matrix, mapping, {
      tenantId: 't1',
      bankAccountId: 'b1',
    });
    expect(result.lines.length).toBeGreaterThan(50);
    const atm = result.lines.find((l) => l.description.includes('ATMCASHWDL'));
    expect(atm?.signedAmount).toBe(-42030);
    const funeral = result.lines.find((l) => l.description.toLowerCase().includes('funeral'));
    expect(funeral?.signedAmount).toBe(7000);
  });
});
