import { describe, expect, it } from 'vitest';
import {
  INPUT_VAT_ACCOUNT_CODE,
  OUTPUT_VAT_ACCOUNT_CODE,
  VAT_REPORT_DISCLAIMER,
  composeVatSummary,
  vatReportCsv,
} from '../src/vat-report';

describe('VAT bookkeeping summary', () => {
  it('nets output credits and input debits including return reverses', () => {
    const summary = composeVatSummary({
      periodBalances: [
        { accountCode: OUTPUT_VAT_ACCOUNT_CODE, accountName: 'Output VAT', debit: 18, credit: 108 },
        { accountCode: INPUT_VAT_ACCOUNT_CODE, accountName: 'Input VAT', debit: 208.8, credit: 21.6 },
      ],
      correspondence: [
        {
          date: '2026-11-13',
          party: 'Walk-in',
          memo: 'Output VAT 18%',
          accountCode: OUTPUT_VAT_ACCOUNT_CODE,
          side: 'credit',
          amount: 90,
        },
        {
          date: '2026-11-13',
          party: 'Walk-in',
          memo: 'Output VAT reverse 18%',
          accountCode: OUTPUT_VAT_ACCOUNT_CODE,
          side: 'debit',
          amount: 18,
        },
        {
          date: '2026-11-13',
          party: 'Vendor',
          memo: 'Input VAT 18%',
          accountCode: INPUT_VAT_ACCOUNT_CODE,
          side: 'debit',
          amount: 208.8,
        },
        {
          date: '2026-11-13',
          party: 'Vendor',
          memo: 'Revenue',
          accountCode: '4000',
          side: 'credit',
          amount: 500,
        },
      ],
    });
    expect(summary.outputVat).toBe(90);
    expect(summary.inputVat).toBe(187.2);
    expect(summary.netPayable).toBe(-97.2);
    expect(summary.correspondence).toHaveLength(3);
    expect(summary.disclaimer).toBe(VAT_REPORT_DISCLAIMER);
  });

  it('exports CSV under the reports-read scope text', () => {
    const summary = composeVatSummary({
      periodBalances: [
        { accountCode: '2200', accountName: 'Output VAT', debit: 0, credit: 90 },
        { accountCode: '2300', accountName: 'Input VAT', debit: 208.8, credit: 0 },
      ],
    });
    const csv = vatReportCsv(summary, 'November 2026');
    expect(csv).toContain('November 2026');
    expect(csv).toContain('Output VAT 2200');
    expect(csv).toContain('208.80');
    expect(csv).toContain('not a statutory VAT return');
  });
});
