import { describe, expect, it } from 'vitest';
import { lineIsOutputTaxable, salesOutputVatRatePercent } from '../src/engine/sales-vat';

describe('sales output VAT classification (BUG-0036)', () => {
  it('charges domestic VAT when the company is registered', () => {
    expect(
      salesOutputVatRatePercent({
        vatRegistered: true,
        saleChannel: 'local',
        domesticRatePercent: 18,
        exportRatePercent: 0,
      }),
    ).toBe(18);
  });

  it('does not use invoice style and zeros unregistered / export defaults', () => {
    expect(
      salesOutputVatRatePercent({
        vatRegistered: false,
        saleChannel: 'local',
        domesticRatePercent: 18,
        exportRatePercent: 0,
      }),
    ).toBe(0);
    expect(
      salesOutputVatRatePercent({
        vatRegistered: true,
        saleChannel: 'export',
        domesticRatePercent: 18,
        exportRatePercent: 0,
      }),
    ).toBe(0);
  });

  it('skips exempt lines and treats standard/unknown as taxable', () => {
    expect(lineIsOutputTaxable('exempt')).toBe(false);
    expect(lineIsOutputTaxable('standard')).toBe(true);
    expect(lineIsOutputTaxable('unknown')).toBe(true);
    expect(lineIsOutputTaxable(null)).toBe(true);
  });
});
