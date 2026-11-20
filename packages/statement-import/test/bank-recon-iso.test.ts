import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { comparisonDifference, finishEligibility } from '../src/finish-eligibility';
import {
  eligiblePostingAccounts,
  pickDefaultPostingCode,
  postingAccountLabel,
} from '../src/posting-accounts';
import { parseStatementDate } from '../src/normalize';
import { mappingIsConfident } from '../src/studio-mapping';
import {
  loadWorkbookMatrix,
  suggestStudioMapping,
  transformStudioMatrix,
} from '../src/studio-transform';

const FIXTURES = path.resolve(__dirname, '../../../docs/coreguard/fixtures/bank-recon');

function transformFile(name: string) {
  const file = path.join(FIXTURES, name);
  const buf = readFileSync(file);
  const { matrix } = loadWorkbookMatrix(buf, name);
  const mapping = suggestStudioMapping(matrix);
  const result = transformStudioMatrix(matrix, mapping, {
    tenantId: 't1',
    bankAccountId: 'b1',
  });
  return { matrix, mapping, result };
}

describe('ISO bank statement CSV', () => {
  it('keeps YYYY-MM-DD through preview and transform', () => {
    const { matrix, mapping, result } = transformFile('qa-statement-clean.csv');
    expect(matrix[1]?.[0]).toBe('2026-11-03');
    expect(mapping.dateFormat).toBe('iso');
    expect(mapping.amountRules.mode).toBe('debit_credit');
    expect(result.lines.map((l) => l.date)).toEqual([
      '2026-11-03',
      '2026-11-06',
      '2026-11-11',
      '2026-11-18',
    ]);
    expect(result.lines.every((l) => l.originalDateText === l.date)).toBe(true);
    expect(result.readyCount).toBe(4);
    expect(result.errorCount).toBe(0);
    expect(result.inputRowCount).toBe(4);
    expect(
      result.readyCount +
        result.warningCount +
        result.errorCount +
        result.skippedCount +
        result.excludedCount,
    ).toBe(result.inputRowCount);
    expect(result.inferredOpening).toBe(1000);
    expect(result.inferredClosing).toBe(1400);
    expect(result.totals.totalMoneyIn).toBe(625);
    expect(result.totals.totalMoneyOut).toBe(225);
    expect(result.balanceCheck.ok).toBe(true);
    expect(result.balanceCheck.difference).toBe(0);
    expect(result.lines.map((l) => l.externalRef)).toEqual([
      'QA-REC-001',
      'QA-PAY-001',
      'QA-REC-002',
      'QA-FEE-001',
    ]);
    expect(mappingIsConfident(mapping)).toBe(true);
  });

  it('parses Excel serial CSV to the same four dates', () => {
    const { mapping, result } = transformFile('qa-statement-serial.csv');
    expect(mapping.dateFormat).toBe('excel-serial');
    expect(result.lines.map((l) => l.date)).toEqual([
      '2026-11-03',
      '2026-11-06',
      '2026-11-11',
      '2026-11-18',
    ]);
    expect(result.readyCount).toBe(4);
    expect(result.inferredOpening).toBe(1000);
    expect(result.inferredClosing).toBe(1400);
  });

  it('surfaces unknown direction even when running balance also breaks', () => {
    const { mapping, result } = transformFile('qa-statement-invalid.csv');
    expect(mapping.amountRules.mode).toBe('amount_with_type');
    expect(mapping.amountRules.typeCol).toBeGreaterThanOrEqual(0);
    expect(result.inputRowCount).toBe(4);
    const unknown = result.lines.find((l) => l.unknownLabel === 'UNKNOWN');
    expect(unknown).toBeTruthy();
    expect(unknown?.validationStatus).toBe('error');
    expect(unknown?.validationMessages.some((m) => /unknown money label/i.test(m))).toBe(true);
    expect(result.issues.some((i) => i.type === 'unknown_label')).toBe(true);
    expect(result.issues.filter((i) => i.type === 'balance_break').length).toBeLessThanOrEqual(1);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(
      result.readyCount +
        result.warningCount +
        result.errorCount +
        result.skippedCount +
        result.excludedCount,
    ).toBe(result.inputRowCount);
  });
});

describe('date format hints', () => {
  it('does not guess 11/3/26 without an explicit format', () => {
    expect(parseStatementDate('11/3/26').iso).toBe('');
    expect(parseStatementDate('11/3/26', { format: 'mdy' }).iso).toBe('2026-11-03');
    expect(parseStatementDate('11/3/26', { format: 'dmy' }).iso).toBe('2026-03-11');
  });

  it('parses unambiguous two-digit years', () => {
    expect(parseStatementDate('15/03/26', { format: 'auto' }).iso).toBe('2026-03-15');
  });
});

describe('finish eligibility', () => {
  it('refuses while bank lines and the difference remain', () => {
    const r = finishEligibility({
      openCases: [
        { caseType: 'create_entry', state: 'needs_review' },
        { caseType: 'outstanding_book', state: 'suggested' },
        { caseType: 'match_1_1', state: 'suggested' },
      ],
      bankClose: 1400,
      bookClose: 1485,
      outstandingNet: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.difference).toBe(-85);
    expect(r.blockers.some((b) => /bank line/i.test(b))).toBe(true);
    expect(r.blockers.some((b) => /difference/i.test(b))).toBe(true);
  });

  it('allows finish when matches are confirmed, fee posted, and 60 is waiting', () => {
    const r = finishEligibility({
      openCases: [{ caseType: 'outstanding_book', state: 'confirmed' }],
      bankClose: 1400,
      bookClose: 1460,
      outstandingNet: 60,
    });
    expect(r.ok).toBe(true);
    expect(r.verified).toBe(true);
    expect(r.difference).toBe(0);
    expect(r.blockers).toEqual([]);
  });

  it('uses the live close formula even when stored differenceAmount is 0', () => {
    const cmp = comparisonDifference({
      bankClose: 1400,
      bookClose: 0,
      outstandingNet: 0,
    });
    expect(cmp.verified).toBe(true);
    expect(cmp.difference).toBe(1400);
    const r = finishEligibility({
      openCases: [{ caseType: 'create_entry', state: 'needs_review' }],
      bankClose: 1400,
      bookClose: 0,
      outstandingNet: 0,
      differenceAmount: 0,
    });
    expect(r.verified).toBe(true);
    expect(r.difference).toBe(1400);
    expect(r.blockers.some((b) => /1400\.00/.test(b))).toBe(true);
  });

  it('does not treat a missing comparison as Rs. 0.00 explained', () => {
    const cmp = comparisonDifference({
      bankClose: null,
      bookClose: 0,
      outstandingNet: 0,
    });
    expect(cmp.verified).toBe(false);
    const r = finishEligibility({
      openCases: [],
      bankClose: null,
      bookClose: null,
      outstandingNet: 0,
      differenceAmount: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.verified).toBe(false);
    expect(r.blockers).toContain('No current comparison');
  });
});

describe('recon posting account labels', () => {
  it('shows the company account name, not a hardcoded Bank fees caption', () => {
    expect(postingAccountLabel({ code: '6800', name: 'General Expense' })).toBe('6800 · General Expense');
    expect(postingAccountLabel({ code: '6800', name: 'Bank service fees' })).toBe('6800 · Bank service fees');
    const eligible = eligiblePostingAccounts(
      [
        { code: '6800', name: 'General Expense', type: 'expense', isActive: '1', isGroup: '0' },
        { code: '4300', name: 'Other Income', type: 'revenue', isActive: '1', isGroup: '0' },
        { code: '3000', name: 'Owner Equity', type: 'equity', isActive: '1', isGroup: '0' },
        { code: '6999', name: 'Expense group', type: 'expense', isActive: '1', isGroup: '1' },
        { code: '6100', name: 'Old rent', type: 'expense', isActive: '0', isGroup: '0' },
      ],
      'out',
    );
    expect(eligible.map((a) => a.code)).toEqual(['6800']);
    expect(pickDefaultPostingCode(eligible, '6800')).toBe('6800');
    expect(postingAccountLabel(eligible[0]!)).not.toMatch(/Bank fees/);
  });
});
