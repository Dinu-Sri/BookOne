import { describe, expect, it } from 'vitest';
import { looksPasswordProtectedExcel, assertWorkbookReadable } from '../src/file-safety';
import {
  dateRangesOverlap,
  gapDaysBetween,
  buildOverlapReport,
} from '../src/overlap';

describe('file-safety', () => {
  it('detects OLE compound as password-protected .xlsx', () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...Array(20).fill(0)]);
    expect(looksPasswordProtectedExcel(ole, 'Statement.xlsx')).toBe(true);
  });

  it('does not flag normal ZIP xlsx', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Array(20).fill(0)]);
    expect(looksPasswordProtectedExcel(zip, 'Statement.xlsx')).toBe(false);
  });

  it('throws clear message for password OLE xlsx', () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...Array(20).fill(0)]);
    expect(() => assertWorkbookReadable(ole, 'bank.xlsx')).toThrow(/password/i);
  });
});

describe('overlap', () => {
  it('detects date range overlap', () => {
    expect(
      dateRangesOverlap(
        { from: '2025-01-01', to: '2025-01-31' },
        { from: '2025-01-15', to: '2025-02-15' },
      ),
    ).toBe(true);
    expect(
      dateRangesOverlap(
        { from: '2025-01-01', to: '2025-01-31' },
        { from: '2025-02-01', to: '2025-02-28' },
      ),
    ).toBe(false);
  });

  it('computes gap days', () => {
    expect(
      gapDaysBetween(
        { from: '2025-01-01', to: '2025-01-31' },
        { from: '2025-02-05', to: '2025-02-28' },
      ),
    ).toBe(4);
  });

  it('builds fingerprint + period warnings', () => {
    const report = buildOverlapReport({
      newFingerprints: ['a', 'b', 'c'],
      knownFingerprints: new Set(['b']),
      newRange: { from: '2025-03-01', to: '2025-03-31' },
      priorImports: [
        {
          fileName: 'Feb.xlsx',
          periodFrom: '2025-02-01',
          periodTo: '2025-02-28',
        },
        {
          fileName: 'Overlap.xlsx',
          periodFrom: '2025-03-10',
          periodTo: '2025-03-20',
        },
      ],
    });
    expect(report.overlappingFingerprints).toEqual(['b']);
    expect(report.periodOverlaps.length).toBe(1);
    expect(report.warnings.some((w) => /already imported/i.test(w))).toBe(true);
    expect(report.warnings.some((w) => /overlaps/i.test(w))).toBe(true);
  });
});
