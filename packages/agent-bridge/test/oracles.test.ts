import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { issuesFromExtraction } from '../src/issues';
import { GOLDEN_CASES, fixtureHash, oracleVatMinor } from '../src/oracles';

const previewSrc = readFileSync(path.resolve(__dirname, '../src/preview.ts'), 'utf8');
const oraclesSrc = readFileSync(path.resolve(__dirname, '../src/oracles.ts'), 'utf8');

describe('golden corpus independence', () => {
  it('oracles do not import production purchase helpers', () => {
    expect(oraclesSrc).not.toMatch(/purchasePreviewTotals|buildVendorBillPosting|expectedPurchaseVat/);
    expect(previewSrc).toMatch(/purchasePreviewTotals/);
  });

  it('maps every golden case to independent expected outcomes', () => {
    for (const c of GOLDEN_CASES) {
      const issues = issuesFromExtraction(c.facts, c.policy, c.id === 'duplicate-scan');
      const codes = issues.filter((i) => i.blocking).map((i) => i.code);
      for (const expected of c.expected.clarificationCodes) {
        expect(codes).toContain(expected);
      }
      if (c.expected.accept) {
        expect(codes).toEqual([]);
        expect(c.expected.net?.minor).toBe(c.facts.net?.value.minor);
        if (c.expected.vat) {
          expect(oracleVatMinor(c.facts.net!.value.minor, c.policy.vatRegistered, c.policy.vatRatePercent)).toBe(
            c.expected.vat.minor,
          );
        }
      }
      expect(fixtureHash(c.id)).toHaveLength(64);
    }
  });
});
